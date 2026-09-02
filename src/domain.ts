import { LocalReservationAuthority, ReservationAuthority } from './authority';
import { defaultPreferences, initialPlan } from './data';
import { reservationFingerprint, reservationIntent, restaurantInventoryKey } from './intent';
import { demoProvider, InventoryProvider } from './providers';
import { FeasibilityCheck, Plan, PlanEvaluation, PlannerResult, PlanSnapshot, Preferences, Reservation, ToolError, ToolResult } from './types';
import { fail, ok, parseInput, planningWindow, updatePlanSchema } from './validation';

export interface PlannerInput {city:'Dhaka';date:string;people:number;budget:number;preferences:Preferences;dinnerDurationMinutes:number;bufferMinutes:number;}
export interface PlanUpdate {expectedVersion:number;restaurantId?:string;restaurantSlot?:string;movieId?:string;showtimeId?:string;transportOptionId?:string;budget?:number;people?:number;preferences?:Preferences;}
const minutes=(time:string)=>{const [hours,mins]=time.split(':').map(Number);return hours*60+mins;};
export const formatTime=(value:number)=>`${String(Math.floor(value/60)%24).padStart(2,'0')}:${String(value%60).padStart(2,'0')}`;
const check=(id:string,label:string,passed:boolean,message:string,blocking=true):FeasibilityCheck=>({id,label,passed,message,blocking});
const newTimestamp=()=>new Date().toISOString();
export const TIMING_POLICY={compact:{targetSlackMinutes:10,maxSlackMinutes:45},relaxed:{targetSlackMinutes:30,maxSlackMinutes:90}} as const;

/**
 * The single authoritative lifecycle predicate.
 *
 * `reservation_pending` is protected exactly like `reserved`: once a commitment is in
 * flight the plan it describes must not move underneath it. Every mutation path — human
 * UI, local solver, and WebMCP tool — asks this one function instead of re-deriving the
 * rule, so the checks cannot drift apart.
 */
export const isPlanImmutable=(plan:Plan)=>plan.status==='reserved'||plan.status==='reservation_pending';
export const immutableReason=(plan:Plan)=>plan.status==='reservation_pending'
  ?'A reservation attempt is in flight for this version. Wait for it to settle before changing anything.'
  :'A confirmed sandbox reservation is immutable. Start a new plan to make changes.';
export const immutableError=(plan:Plan)=>fail(plan.status==='reservation_pending'?'RESERVATION_IN_PROGRESS':'PLAN_IMMUTABLE',immutableReason(plan),undefined,plan.status==='reservation_pending');

/**
 * Reservation ownership / integrity.
 *
 * A reservation is only "yours" when the record on the plan, the record in the provider
 * ledger, and the inventory the provider actually committed all describe the current
 * plan's selections. Comparing reservation id, plan id, and version is not enough: a
 * replayed or forged record can satisfy those while pointing at different inventory,
 * which is exactly the state that must never render as "Reserved · confirmed".
 */
/** A date can leave the rolling window simply because time passed; that is not tampering. */
export const dateOutsideWindow=(date:string)=>{const {start,end}=planningWindow();return date<start||date>end;};

export function reservationOwnership(plan:Plan,provider:InventoryProvider=demoProvider):{ok:boolean;message:string;failures:string[]}{
  if(plan.status!=='reserved')return {ok:true,message:'No provider commitment is required before reservation.',failures:[]};
  const record=plan.reservation;const failures:string[]=[];
  if(!record||record.status!=='confirmed')return {ok:false,message:'Reserved state carries no confirmed reservation record.',failures:['missing confirmed reservation record']};
  // The evening has simply passed: live inventory can no longer be projected for that date, so
  // compare the immutable ledger record instead of accusing a genuine reservation of forgery.
  if(dateOutsideWindow(plan.date)){
    const archived=provider.getReservation(plan);
    return archived&&archived.id===record.id&&archived.fingerprint===record.fingerprint
      ?{ok:true,message:`This evening has passed. Reservation ${record.id} stays committed in the ledger for version ${plan.version}.`,failures:[]}
      :{ok:false,message:'Reserved state has no matching provider commitment.',failures:['no provider commitment exists for this plan version']};
  }
  const expected=reservationFingerprint(plan,provider);const intent=reservationIntent(plan,provider);
  const persisted=provider.getReservation(plan);
  if(record.planId!==plan.id)failures.push('reservation belongs to a different plan');
  if(record.version!==plan.version)failures.push(`reservation belongs to version ${record.version}, not ${plan.version}`);
  if(record.fingerprint!==expected)failures.push('reservation intent does not match the current date, party size, or selections');
  if(!persisted)failures.push('no provider commitment exists for this plan version');
  else{
    if(persisted.id!==record.id)failures.push('provider commitment has a different reservation id');
    if(persisted.fingerprint!==expected)failures.push('provider commitment was made for different inventory');
  }
  // Both copies of the record must describe the same committed inventory as the plan's
  // current selections: the ledger copy and the one carried on the plan.
  for(const source of persisted?[record,persisted]:[record]){
    const committed=source.inventory.filter(item=>item.state==='committed');
    const table=committed.find(item=>item.kind==='restaurant');const seats=committed.find(item=>item.kind==='showtime');
    if(!table||table.inventoryKey!==intent.restaurantInventoryKey)failures.push('committed table does not match the selected restaurant, date, and slot');
    else if(table.quantity<plan.people)failures.push(`only ${table.quantity} seats are committed at the table for ${plan.people} people`);
    if(!seats||seats.inventoryKey!==intent.showtimeInventoryKey)failures.push('committed cinema seats do not match the selected showtime');
    else if(seats.quantity<plan.people)failures.push(`only ${seats.quantity} cinema seats are committed for ${plan.people} people`);
  }
  return failures.length
    ?{ok:false,message:`Reservation integrity failure: ${failures[0]}.`,failures}
    :{ok:true,message:'Provider commitment matches this exact plan version and its selections.',failures};
}

export function evaluatePlan(plan:Plan,provider:InventoryProvider=demoProvider):PlanEvaluation{
  const selected=plan.selections;
  const restaurant=provider.getRestaurant(selected.restaurantId); const movie=provider.getMovie(selected.movieId); const showtime=provider.showtimeSnapshot(selected.showtimeId,plan); const cinema=provider.getCinema(showtime?.cinemaId);
  const route=provider.getRoute(cinema?.locationId,restaurant?.locationId); const transport=provider.getTransportOption(route,selected.transportOptionId);
  const checks:FeasibilityCheck[]=[];
  const outsideWindow=dateOutsideWindow(plan.date);
  checks.push(check('date_window','Planning date',!outsideWindow,outsideWindow?`${plan.date} is outside the supported window (${planningWindow().start} to ${planningWindow().end}). This evening has passed — start a new plan to choose a current date.`:`${plan.date} is inside the supported window.`));
  checks.push(check('complete','Plan completeness',Boolean(restaurant&&selected.restaurantSlot&&movie&&showtime&&cinema&&transport),restaurant&&selected.restaurantSlot&&movie&&showtime&&cinema&&transport?'All required services are selected.':'Restaurant slot, movie showtime, and route transport are all required.'));
  checks.push(check('city','City consistency',Boolean(restaurant?.city===plan.city&&cinema?.city===plan.city),restaurant&&cinema?`${restaurant.city} restaurant and ${cinema.city} cinema match ${plan.city}.`:'Selected providers must exist in the plan city.'));
  const slot=restaurant&&provider.restaurantSlots(restaurant,plan.date,plan).find(item=>item.time===selected.restaurantSlot);
  const ownsRestaurant=slot?.inventoryState==='committed_to_current_plan'&&(slot.committedQuantity??0)>=plan.people;
  const restaurantAvailable=Boolean(slot&&restaurant&&(ownsRestaurant||slot.capacityRemaining>=plan.people)&&plan.people>=restaurant.minParty&&plan.people<=restaurant.maxParty);
  checks.push(check('restaurant_availability','Restaurant availability',restaurantAvailable,ownsRestaurant?`${plan.people} seats at ${slot?.time} are committed to this plan.`:slot?`${slot.capacityRemaining} seats remain at ${slot.time}; ${plan.people} requested.`:'Selected restaurant slot is unavailable for this date.'));
  const ownsShowtime=showtime?.inventoryState==='committed_to_current_plan'&&(showtime.committedQuantity??0)>=plan.people;
  const showtimeValid=Boolean(showtime&&movie&&showtime.movieId===movie.id&&showtime.date===plan.date&&(ownsShowtime||showtime.seatsRemaining>=plan.people));
  checks.push(check('showtime_integrity','Movie and showtime integrity',showtimeValid,showtime&&movie?ownsShowtime?`${plan.people} seats for ${movie.title} are committed to this plan.`:`${showtime.id} belongs to ${movie.title} on ${showtime.date}; ${showtime.seatsRemaining} seats remain.`:'Showtime must belong to the selected movie, date, and have enough seats.'));
  const ownership=reservationOwnership(plan,provider);
  checks.push(check('reservation_integrity','Reservation ownership',ownership.ok,ownership.message));
  checks.push(check('route','Route availability',Boolean(route&&transport),route&&transport?`${route.distanceKm.toFixed(1)} km via ${transport.name}, ${transport.durationMinutes} minutes.`:'No verified route and transport option connects the selected venues.'));
  let timeline:PlanEvaluation['timeline']=null;
  // Real-world evening order: the movie runs first, then travel to the restaurant, then dinner.
  if(selected.restaurantSlot&&showtime&&movie&&transport&&restaurant){
    const movieStart=minutes(showtime.startTime); const movieEnd=movieStart+movie.durationMinutes;
    const departAt=movieEnd; const arriveAt=departAt+transport.durationMinutes; const readyAt=arriveAt+plan.bufferMinutes;
    const dinnerStart=minutes(selected.restaurantSlot); const dinnerEnd=dinnerStart+plan.dinnerDurationMinutes; const slack=dinnerStart-readyAt;
    timeline={movieStart:showtime.startTime,movieEnd:formatTime(movieEnd),departAt:formatTime(departAt),arriveAt:formatTime(arriveAt),readyAt:formatTime(readyAt),dinnerStart:formatTime(dinnerStart),dinnerEnd:formatTime(dinnerEnd),slackMinutes:slack};
    const policy=TIMING_POLICY[plan.preferences.timing];const chronologyValid=slack>=0&&slack<=policy.maxSlackMinutes;
    checks.push(check('chronology','Schedule chronology',chronologyValid,slack<0?`The table is booked ${Math.abs(slack)} minutes before you could arrive from the cinema.`:slack>policy.maxSlackMinutes?`${slack} idle minutes after the film exceeds the ${policy.maxSlackMinutes}-minute ${plan.preferences.timing} timing limit.`:`Film ends ${formatTime(movieEnd)}, table at ${formatTime(dinnerStart)}; ${slack} minutes of slack after travel and the ${plan.bufferMinutes}-minute buffer.`));
    const opensAt=minutes(restaurant.opensAt); const closesAt=minutes(restaurant.closesAt);
    const withinHours=dinnerStart>=opensAt&&dinnerEnd<=closesAt;
    checks.push(check('restaurant_hours','Restaurant opening window',withinHours,withinHours?`${restaurant.name} is open ${restaurant.openingHours}; dinner runs ${formatTime(dinnerStart)}–${formatTime(dinnerEnd)}.`:dinnerStart<opensAt?`${restaurant.name} opens at ${restaurant.opensAt}, after the ${formatTime(dinnerStart)} table.`:`A ${plan.dinnerDurationMinutes}-minute dinner from ${formatTime(dinnerStart)} runs past the ${restaurant.closesAt} close.`));
  }else{
    checks.push(check('chronology','Schedule chronology',false,'A complete showtime, route, and dinner slot are required to calculate chronology.'));
    checks.push(check('restaurant_hours','Restaurant opening window',false,'The restaurant opening window is checked once a dinner time is known.'));
  }
  const restaurantCost=restaurant?restaurant.pricePerPerson*plan.people:null; const movieCost=showtime&&showtimeValid?showtime.price*plan.people:null; const transportCost=transport?.fare??null;
  const completeCosts=restaurantCost!==null&&movieCost!==null&&transportCost!==null; const total=completeCosts?restaurantCost+movieCost+transportCost:null;
  const costs={restaurant:restaurantCost,movie:movieCost,transport:transportCost,total,remainingBudget:total===null?null:plan.budget-total};
  checks.push(check('budget','Budget',total!==null&&total<=plan.budget,total===null?'Complete valid selections are required for a reliable total.':total<=plan.budget?`৳${total.toLocaleString()} of ৳${plan.budget.toLocaleString()}; ৳${(plan.budget-total).toLocaleString()} remains.`:`Budget exceeded by ৳${(total-plan.budget).toLocaleString()}.`));
  return {valid:checks.filter(item=>item.blocking).every(item=>item.passed),providerRevision:provider.revision,checks,costs,timeline};
}

export function snapshotPlan(plan:Plan,provider:InventoryProvider=demoProvider):PlanSnapshot{
  const restaurantSource=provider.getRestaurant(plan.selections.restaurantId);const restaurant=restaurantSource?{...restaurantSource,slots:provider.restaurantSlots(restaurantSource,plan.date,plan)}:null; const movie=provider.getMovie(plan.selections.movieId)??null;
  const showtime=provider.showtimeSnapshot(plan.selections.showtimeId,plan)??null; const cinema=provider.getCinema(showtime?.cinemaId)??null;
  const route=provider.getRoute(cinema?.locationId,restaurant?.locationId)??null; const transport=provider.getTransportOption(route??undefined,plan.selections.transportOptionId)??null;
  return {plan,evaluation:evaluatePlan(plan,provider),restaurant,movie,showtime,cinema,route,transport};
}

function scorePlan(plan:Plan,evaluation:PlanEvaluation,provider:InventoryProvider){
  const restaurant=provider.getRestaurant(plan.selections.restaurantId)!; const movie=provider.getMovie(plan.selections.movieId)!; const showtime=provider.getShowtime(plan.selections.showtimeId)!; const cinema=provider.getCinema(showtime.cinemaId)!; const transport=provider.getTransportOption(provider.getRoute(cinema.locationId,restaurant.locationId),plan.selections.transportOptionId)!;
  let score=restaurant.rating*18+movie.rating*7;
  if(plan.preferences.cuisine&&restaurant.cuisine.toLowerCase().includes(plan.preferences.cuisine.toLowerCase()))score+=45;
  if(plan.preferences.movieGenre&&movie.genre.toLowerCase().includes(plan.preferences.movieGenre.toLowerCase()))score+=35;
  if(plan.preferences.transport==='comfortable'&&transport.kind==='comfort')score+=25;
  if(plan.preferences.transport==='fastest')score-=transport.durationMinutes;
  if(plan.preferences.transport==='lowest_cost')score-=transport.fare/30;
  // Priority must be able to overturn the baseline rating ranking, otherwise it is collected and ignored.
  if(plan.preferences.priority==='lowest_cost')score-=(evaluation.costs.total??0)/25;
  if(plan.preferences.priority==='highest_rated')score+=restaurant.rating*30+movie.rating*10;
  const slack=evaluation.timeline?.slackMinutes??0;
  score-=plan.preferences.timing==='relaxed'?Math.abs(slack-30)*0.65:Math.abs(slack-10)*0.9;
  return score;
}

export function solvePlan(input:PlannerInput,baseVersion=0,fixed?:{restaurantId?:string;restaurantSlot?:string;movieId?:string;showtimeId?:string},provider:InventoryProvider=demoProvider):PlannerResult{
  const candidateRestaurants=provider.searchRestaurants({city:input.city,date:input.date,people:input.people,minRating:input.preferences.minRestaurantRating});
  const candidateShows=provider.searchShowtimes({city:input.city,date:input.date,people:input.people});
  if(!candidateRestaurants.length)return {ok:false,error:{code:'NO_RESTAURANT_AVAILABILITY',message:'No restaurant has capacity for these constraints.',retryable:true}};
  if(!candidateShows.length)return {ok:false,error:{code:'NO_SHOWTIME_AVAILABILITY',message:'No movie showtime has enough seats on this date.',retryable:true}};
  const valid:Array<{plan:Plan;evaluation:PlanEvaluation;score:number}>=[]; const closest:Array<{restaurantId:string;showtimeId:string;failedChecks:string[]}>=[]; let considered=0;
  for(const restaurant of candidateRestaurants.filter(item=>!fixed?.restaurantId||item.id===fixed.restaurantId)){
    for(const slot of provider.availableRestaurantSlots(restaurant,input.date,input.people).filter(item=>!fixed?.restaurantSlot||item.time===fixed.restaurantSlot)){
      for(const showtime of candidateShows.filter(item=>(!fixed?.movieId||item.movieId===fixed.movieId)&&(!fixed?.showtimeId||item.id===fixed.showtimeId))){
        const cinema=provider.getCinema(showtime.cinemaId)!; const route=provider.getRoute(cinema.locationId,restaurant.locationId); if(!route)continue;
        for(const transport of route.options){
          considered++;
          const plan:Plan={id:'current-plan',version:baseVersion+1,city:input.city,date:input.date,people:input.people,budget:input.budget,preferences:input.preferences,dinnerDurationMinutes:input.dinnerDurationMinutes,bufferMinutes:input.bufferMinutes,selections:{restaurantId:restaurant.id,restaurantSlot:slot.time,movieId:showtime.movieId,showtimeId:showtime.id,transportOptionId:transport.id},status:'draft',updatedAt:newTimestamp(),changeSummary:'Generated a feasible evening from shared constraints'};
          const evaluation=evaluatePlan(plan,provider); if(evaluation.valid)valid.push({plan:{...plan,status:'valid'},evaluation,score:scorePlan(plan,evaluation,provider)}); else if(closest.length<8)closest.push({restaurantId:restaurant.id,showtimeId:showtime.id,failedChecks:evaluation.checks.filter(item=>!item.passed).map(item=>item.id)});
        }
      }
    }
  }
  if(!valid.length)return {ok:false,error:{code:'NO_FEASIBLE_PLAN',message:'No combination satisfies availability, route, chronology, and budget.',retryable:true,details:['Try a larger budget, shorter dinner, smaller group, or different preferences.']},closest};
  valid.sort((a,b)=>b.score-a.score);
  const winner=valid[0]; const restaurant=provider.getRestaurant(winner.plan.selections.restaurantId)!; const movie=provider.getMovie(winner.plan.selections.movieId)!;
  return {ok:true,plan:winner.plan,evaluation:winner.evaluation,considered,explanation:[`${restaurant.name} and ${movie.title} ranked highest across availability, preference fit, rating, time, and cost.`,winner.evaluation.checks.find(item=>item.id==='chronology')!.message,winner.evaluation.checks.find(item=>item.id==='budget')!.message]};
}

/**
 * Dinner time is a consequence of the film, not a free choice: the user picks a restaurant
 * and PlanOnIt picks the table that fits the evening. Returns every published slot with the
 * slack it would leave, so the UI can show an operating window instead of raw inventory.
 */
export function rankedDinnerSlots(plan:Plan,restaurantId:string,provider:InventoryProvider=demoProvider){
  const restaurant=provider.getRestaurant(restaurantId);if(!restaurant)return [];
  const movie=provider.getMovie(plan.selections.movieId);const showtime=provider.getShowtime(plan.selections.showtimeId);
  const cinema=provider.getCinema(showtime?.cinemaId);const route=provider.getRoute(cinema?.locationId,restaurant.locationId);
  const transport=provider.getTransportOption(route,plan.selections.transportOptionId)
    ??route?.options.slice().sort((a,b)=>a.durationMinutes-b.durationMinutes)[0];
  const readyAt=movie&&showtime&&transport?minutes(showtime.startTime)+movie.durationMinutes+transport.durationMinutes+plan.bufferMinutes:null;
  const target=TIMING_POLICY[plan.preferences.timing].targetSlackMinutes;
  const closesAt=minutes(restaurant.closesAt);const opensAt=minutes(restaurant.opensAt);
  return provider.restaurantSlots(restaurant,plan.date,plan).map(slot=>{
    const start=minutes(slot.time);const owned=slot.inventoryState==='committed_to_current_plan'&&(slot.committedQuantity??0)>=plan.people;
    const hasCapacity=owned||(slot.capacityRemaining>=plan.people&&plan.people>=restaurant.minParty&&plan.people<=restaurant.maxParty);
    const slack=readyAt===null?null:start-readyAt;
    const withinHours=start>=opensAt&&start+plan.dinnerDurationMinutes<=closesAt;
    const feasible=hasCapacity&&withinHours&&slack!==null&&slack>=0&&slack<=TIMING_POLICY[plan.preferences.timing].maxSlackMinutes;
    return {time:slot.time,slack,feasible,hasCapacity,withinHours};
  }).sort((a,b)=>Number(b.feasible)-Number(a.feasible)||Math.abs((a.slack??999)-target)-Math.abs((b.slack??999)-target));
}
export const bestDinnerSlot=(plan:Plan,restaurantId:string,provider:InventoryProvider=demoProvider)=>rankedDinnerSlots(plan,restaurantId,provider).find(slot=>slot.feasible);

export function createBlankPlan(overrides?:Partial<Pick<Plan,'city'|'date'|'people'|'budget'>>):Plan{return {...initialPlan(),...overrides,preferences:defaultPreferences()};}
export function applyPlanUpdate(plan:Plan,input:unknown,provider:InventoryProvider=demoProvider):ToolResult<{plan:Plan;evaluation:PlanEvaluation;clearedDependencies:string[];changed:boolean}>{
  const parsed=parseInput(updatePlanSchema,input);if(!parsed.ok)return parsed;const change:PlanUpdate=parsed.data;
  if(change.expectedVersion!==plan.version)return fail('STALE_PLAN_VERSION',`Expected version ${change.expectedVersion}, but current version is ${plan.version}.`,'expectedVersion',true);
  if(isPlanImmutable(plan))return immutableError(plan);
  const changed=change.budget!==undefined&&change.budget!==plan.budget||change.people!==undefined&&change.people!==plan.people||change.preferences!==undefined&&JSON.stringify(change.preferences)!==JSON.stringify(plan.preferences)||change.restaurantId!==undefined&&(change.restaurantId!==plan.selections.restaurantId||change.restaurantSlot!==plan.selections.restaurantSlot)||change.movieId!==undefined&&(change.movieId!==plan.selections.movieId||change.showtimeId!==plan.selections.showtimeId)||change.transportOptionId!==undefined&&change.transportOptionId!==plan.selections.transportOptionId;
  if(!changed)return ok({plan,evaluation:evaluatePlan(plan,provider),clearedDependencies:[],changed:false});
  const next:Plan={...plan,selections:{...plan.selections},version:plan.version+1,status:'draft',approval:undefined,reservation:undefined,updatedAt:newTimestamp(),changeSummary:'Updated the shared draft'}; const clearedDependencies:string[]=[];
  if(change.budget!==undefined)next.budget=change.budget; if(change.people!==undefined)next.people=change.people; if(change.preferences)next.preferences=change.preferences;
  if(change.restaurantId&&change.restaurantSlot){const restaurant=provider.getRestaurant(change.restaurantId);if(!restaurant)return fail('UNKNOWN_RESTAURANT','Restaurant ID was not found.','restaurantId',true);const slot=provider.availableRestaurantSlots(restaurant,next.date,next.people).find(item=>item.time===change.restaurantSlot);if(!slot)return fail('INVALID_RESTAURANT_SLOT','The selected slot is unavailable for this restaurant, date, and party size.','restaurantSlot',true);next.selections.restaurantId=restaurant.id;next.selections.restaurantSlot=slot.time;}
  if(change.movieId&&change.showtimeId){const movie=provider.getMovie(change.movieId);const showtime=provider.getShowtime(change.showtimeId);if(!movie)return fail('UNKNOWN_MOVIE','Movie ID was not found.','movieId',true);if(!showtime)return fail('UNKNOWN_SHOWTIME','Showtime ID was not found.','showtimeId',true);if(showtime.movieId!==movie.id)return fail('MOVIE_SHOWTIME_MISMATCH','Showtime does not belong to the selected movie.','showtimeId',true);if(showtime.date!==next.date)return fail('SHOWTIME_DATE_MISMATCH','Showtime does not match the plan date.','showtimeId',true);next.selections.movieId=movie.id;next.selections.showtimeId=showtime.id;}
  const restaurant=provider.getRestaurant(next.selections.restaurantId);const showtime=provider.getShowtime(next.selections.showtimeId);const cinema=provider.getCinema(showtime?.cinemaId);const route=provider.getRoute(cinema?.locationId,restaurant?.locationId);
  if(change.transportOptionId){if(!provider.getTransportOption(route,change.transportOptionId))return fail('INVALID_TRANSPORT_OPTION','Transport option does not belong to the selected venue route.','transportOptionId',true);next.selections.transportOptionId=change.transportOptionId;}
  else if(next.selections.transportOptionId&&!provider.getTransportOption(route,next.selections.transportOptionId)){delete next.selections.transportOptionId;clearedDependencies.push('transportOptionId');}
  const evaluation=evaluatePlan(next,provider);next.status=evaluation.valid?'valid':'draft';return ok({plan:next,evaluation,clearedDependencies,changed:true});
}

export function repairPlan(plan:Plan,input:{expectedVersion:number;preserveRestaurant:boolean;preserveMovie:boolean},provider:InventoryProvider=demoProvider):PlannerResult{
  if(input.expectedVersion!==plan.version)return {ok:false,error:{code:'STALE_PLAN_VERSION',message:`Expected version ${input.expectedVersion}, but current version is ${plan.version}.`,field:'expectedVersion',retryable:true}};
  if(plan.status==='reserved')return {ok:false,error:{code:'PLAN_ALREADY_RESERVED',message:'Reserved plans cannot be repaired. Start a new plan to plan again.',retryable:false}};
  if(plan.status==='reservation_pending')return {ok:false,error:{code:'RESERVATION_IN_PROGRESS',message:immutableReason(plan),retryable:true}};
  const result=solvePlan({city:'Dhaka',date:plan.date,people:plan.people,budget:plan.budget,preferences:plan.preferences,dinnerDurationMinutes:plan.dinnerDurationMinutes,bufferMinutes:plan.bufferMinutes},plan.version,// The table time is a dependent choice — it follows the film — so repair keeps the
// restaurant the human asked for but is free to move the booking to a feasible slot.
{restaurantId:input.preserveRestaurant?plan.selections.restaurantId:undefined,movieId:input.preserveMovie?plan.selections.movieId:undefined,showtimeId:input.preserveMovie?plan.selections.showtimeId:undefined},provider);
  return result.ok?{...result,plan:{...result.plan,changeSummary:'Repaired the plan and recalculated dependent choices'}}:result;
}

export const hasActiveReservation=(plan:Plan)=>plan.status==='reserved'&&plan.reservation?.status==='confirmed';

/**
 * Recovery for an abandoned in-flight reservation.
 *
 * `reservation_pending` is deliberately immutable, which means a plan persisted in that
 * state by a tab that was closed, reloaded, or crashed mid-commit can never be moved again:
 * update, repair, approve, reserve, and start_new_plan all refuse it correctly, and only a
 * destructive reset escapes. That is a real dead end, so on load — when nothing is in flight
 * in this process — the pending state is reconciled against the authoritative ledger:
 *
 *  - the ledger holds a confirmed commitment for this exact intent → the plan is promoted to
 *    `reserved` with the ledger's own record, so a commitment that really happened is never
 *    lost or hidden;
 *  - otherwise no inventory was consumed, so the attempt is recorded as `reservation_failed`
 *    with its holds released and approval cleared, and the human must approve again.
 *
 * The version never moves and inventory is never consumed here: this only resolves a status
 * that is already known to be stale, and only for a plan that is not being committed now.
 */
export function reconcileAbandonedReservation(plan:Plan,provider:InventoryProvider=demoProvider):{plan:Plan;resolved:'none'|'reserved'|'failed'}{
  if(plan.status!=='reservation_pending')return {plan,resolved:'none'};
  const committed=provider.getReservation(plan);
  const expected=reservationFingerprint(plan,provider);
  if(committed&&committed.status==='confirmed'&&committed.fingerprint===expected)
    return {plan:{...plan,status:'reserved',reservation:committed,updatedAt:newTimestamp(),changeSummary:`Recovered confirmed reservation ${committed.id} after an interrupted attempt`},resolved:'reserved'};
  const released=plan.reservation
    ?{...plan.reservation,status:'failed' as const,inventory:plan.reservation.inventory.map(item=>({...item,state:'released' as const})),failureCode:'RESERVATION_ABANDONED'}
    :undefined;
  return {plan:{...plan,status:'reservation_failed',approval:undefined,reservation:released,updatedAt:newTimestamp(),changeSummary:'An interrupted reservation attempt was released; nothing was committed'},resolved:'failed'};
}
export function startNewPlan(plan:Plan,expectedVersion:number,provider:InventoryProvider=demoProvider):ToolResult<{plan:Plan;archivedReservation?:Reservation;reservationLedger:Reservation[]}>{
  if(expectedVersion!==plan.version)return fail('STALE_PLAN_VERSION',`Expected version ${expectedVersion}, but current version is ${plan.version}.`,'expectedVersion',true);
  if(plan.status==='reservation_pending')return fail('RESERVATION_IN_PROGRESS','A reservation attempt is still resolving. Retry once it settles.',undefined,true);
  const archivedReservation=hasActiveReservation(plan)?plan.reservation:undefined;
  const carriedDate=dateOutsideWindow(plan.date)?createBlankPlan().date:plan.date;
  const next:Plan={...createBlankPlan({city:plan.city,date:carriedDate,people:plan.people,budget:plan.budget}),preferences:plan.preferences,version:plan.version+1,status:'draft',updatedAt:newTimestamp(),changeSummary:archivedReservation?`Started a new plan; reservation ${archivedReservation.id} stays committed to version ${archivedReservation.version}`:'Started a new plan'};
  return ok({plan:next,archivedReservation,reservationLedger:provider.listReservations()});
}

export function approvePlan(plan:Plan,expectedVersion:number,provider:InventoryProvider=demoProvider):ToolResult<{plan:Plan;evaluation:PlanEvaluation}>{
  if(expectedVersion!==plan.version)return fail('STALE_PLAN_VERSION',`Expected version ${expectedVersion}, but current version is ${plan.version}.`,'expectedVersion',true);
  if(plan.status==='reserved')return fail('PLAN_ALREADY_RESERVED','This plan already has a simulated reservation.');
  if(plan.status==='reservation_pending')return immutableError(plan);
  const evaluation=evaluatePlan(plan,provider);if(!evaluation.valid)return fail('PLAN_INVALID','Approval blocked until every feasibility check passes.',undefined,true,evaluation.checks.filter(item=>!item.passed).map(item=>item.message));
  return ok({plan:{...plan,status:'approved',approval:{version:plan.version,providerRevision:provider.revision,approvedAt:newTimestamp()},updatedAt:newTimestamp(),changeSummary:`Human approved version ${plan.version}`},evaluation});
}

/** Returns a human-readable reason when the live workspace no longer matches the in-flight intent. */
function detectReservationDrift(original:Plan,fingerprint:string,pending:Reservation,current:Plan,provider:InventoryProvider):string|undefined{
  if(current.id!==original.id)return `plan identity changed from ${original.id} to ${current.id}`;
  if(current.version>original.version)return `a newer version ${current.version} replaced version ${original.version}`;
  if(current.version!==original.version)return `the live version is ${current.version}, not ${original.version}`;
  if(current.status==='reserved')return 'the plan was already reserved by another writer';
  if(current.status!=='reservation_pending'&&current.status!=='approved')return `the plan moved to ${current.status} while the reservation was in flight`;
  if(current.status==='reservation_pending'&&current.reservation&&current.reservation.id!==pending.id)return 'another reservation attempt owns this version';
  if(current.date!==original.date)return 'the date changed';
  if(current.people!==original.people)return 'the party size changed';
  if(reservationFingerprint({...current,version:original.version},provider)!==fingerprint)return 'the selections changed';
  return undefined;
}

export type ReservationResult={ok:true;data:{plan:Plan;reservationId:string;message:string;idempotent:boolean;transitions:string[]}}|{ok:false;error:ToolError;plan?:Plan;transitions?:string[]};
/**
 * The one consequential write.
 *
 * Everything that identifies the commitment — plan identity, version, date, party size,
 * selections, and provider inventory keys — is captured as a fingerprint *before* the
 * awaited authority call. Afterwards the caller-supplied `readCurrentPlan` re-reads the
 * live workspace and the result is only written back when the workspace still describes
 * that exact intent. If anything moved (another tab, another agent, a newer version), the
 * attempt fails safely: no older reservation result is ever written over a newer plan.
 */
export async function reservePlan(plan:Plan,expectedVersion:number,provider:InventoryProvider=demoProvider,onPending?:(plan:Plan)=>void|Promise<void>,authority:ReservationAuthority=new LocalReservationAuthority(provider),readCurrentPlan?:()=>Plan):Promise<ReservationResult>{
  if(expectedVersion!==plan.version)return fail('STALE_PLAN_VERSION',`Expected version ${expectedVersion}, but current version is ${plan.version}.`,'expectedVersion',true);
  if(plan.status==='reserved'&&plan.reservation?.status==='confirmed')return {ok:true,data:{plan,reservationId:plan.reservation.id,message:'The existing sandbox confirmation was returned without consuming inventory again.',idempotent:true,transitions:['reserved']}};
  if(plan.status==='reservation_pending')return fail('RESERVATION_IN_PROGRESS',immutableReason(plan),undefined,true);
  if(plan.status!=='approved'||plan.approval?.version!==plan.version)return fail('HUMAN_APPROVAL_REQUIRED','The human must approve this exact valid version in the UI first.',undefined,true);
  if(plan.approval.providerRevision!==provider.revision)return fail('PROVIDER_STATE_CHANGED','Provider inventory changed after approval. Revalidate and approve the current version again.',undefined,true);
  const evaluation=evaluatePlan(plan,provider);if(!evaluation.valid)return fail('PLAN_INVALID','Reservation blocked because the plan is no longer valid.',undefined,true,evaluation.checks.filter(item=>!item.passed).map(item=>item.message));
  // Captured before any await: this is the exact intent the authority is asked to commit.
  const fingerprint=reservationFingerprint(plan,provider);const idempotencyKey=fingerprint;
  const selectedRestaurant=provider.getRestaurant(plan.selections.restaurantId);const selectedSlot=selectedRestaurant&&provider.restaurantSlots(selectedRestaurant,plan.date).find(item=>item.time===plan.selections.restaurantSlot);const selectedShowtime=provider.getShowtime(plan.selections.showtimeId);
  const pendingReservation:Reservation={id:`PENDING-${plan.id.toUpperCase()}-V${plan.version}`,planId:plan.id,version:plan.version,providerRevision:provider.revision,status:'pending',reservedAt:newTimestamp(),idempotencyKey,fingerprint,inventory:[...(selectedRestaurant&&selectedSlot?[{kind:'restaurant' as const,inventoryKey:restaurantInventoryKey(selectedRestaurant.id,plan.date,selectedSlot.time),quantity:plan.people,state:'held' as const}]:[]),...(selectedShowtime?[{kind:'showtime' as const,inventoryKey:selectedShowtime.id,quantity:plan.people,state:'held' as const}]:[])]};
  const pendingPlan:Plan={...plan,status:'reservation_pending',reservation:pendingReservation,updatedAt:newTimestamp(),changeSummary:'Sandbox reservation pending'};
  if(onPending)await onPending(pendingPlan);
  const providerResult=await authority.commit(pendingPlan);
  // Post-await re-read: refuse to write a result that no longer describes the live workspace.
  const drift=readCurrentPlan?detectReservationDrift(plan,fingerprint,pendingReservation,readCurrentPlan(),provider):undefined;
  if(drift)return {ok:false,error:{code:'RESERVATION_STATE_CHANGED',message:`The workspace changed while the reservation was in flight (${drift}). No plan was overwritten; check the reservation ledger before retrying.`,retryable:true,details:[drift]},transitions:['approved','reservation_pending']};
  if(providerResult.ok&&providerResult.data.providerState)provider.importState(providerResult.data.providerState);if(!providerResult.ok){const failedReservation:Reservation={...pendingReservation,status:'failed',inventory:pendingReservation.inventory.map(item=>({...item,state:'released'})),failureCode:providerResult.error.code};const failedPlan:Plan={...plan,status:'reservation_failed',approval:undefined,reservation:failedReservation,updatedAt:newTimestamp(),changeSummary:`Sandbox reservation failed: ${providerResult.error.code}`};return {ok:false,error:providerResult.error,plan:failedPlan,transitions:['approved','reservation_pending','reservation_failed']};}
  const reservation=providerResult.data.reservation;const next:Plan={...plan,status:'reserved',reservation,updatedAt:newTimestamp(),changeSummary:`Created sandbox reservation ${reservation.id}`};
  return {ok:true,data:{plan:next,reservationId:reservation.id,idempotent:providerResult.data.idempotent,transitions:['approved','reservation_pending','reserved'],message:'Sandbox provider confirmation created. Inventory was committed to this plan; no real business, payment, or ride service was contacted.'}};
}
export const domainError=(code:string,message:string):ToolError=>({code,message,retryable:false});
