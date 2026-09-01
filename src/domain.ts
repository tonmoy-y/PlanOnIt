import { LocalReservationAuthority, ReservationAuthority } from './authority';
import { defaultPreferences, initialPlan } from './data';
import { demoProvider, InventoryProvider } from './providers';
import { FeasibilityCheck, Plan, PlanEvaluation, PlannerResult, PlanSnapshot, Preferences, Reservation, ToolError, ToolResult } from './types';
import { fail, ok, parseInput, updatePlanSchema } from './validation';

export interface PlannerInput {city:'Dhaka';date:string;people:number;budget:number;preferences:Preferences;dinnerDurationMinutes:number;bufferMinutes:number;}
export interface PlanUpdate {expectedVersion:number;restaurantId?:string;restaurantSlot?:string;movieId?:string;showtimeId?:string;transportOptionId?:string;budget?:number;people?:number;preferences?:Preferences;}
const minutes=(time:string)=>{const [hours,mins]=time.split(':').map(Number);return hours*60+mins;};
export const formatTime=(value:number)=>`${String(Math.floor(value/60)%24).padStart(2,'0')}:${String(value%60).padStart(2,'0')}`;
const check=(id:string,label:string,passed:boolean,message:string,blocking=true):FeasibilityCheck=>({id,label,passed,message,blocking});
const newTimestamp=()=>new Date().toISOString();
export const TIMING_POLICY={compact:{targetSlackMinutes:10,maxSlackMinutes:45},relaxed:{targetSlackMinutes:30,maxSlackMinutes:90}} as const;

export function evaluatePlan(plan:Plan,provider:InventoryProvider=demoProvider):PlanEvaluation{
  const selected=plan.selections;
  const restaurant=provider.getRestaurant(selected.restaurantId); const movie=provider.getMovie(selected.movieId); const showtime=provider.showtimeSnapshot(selected.showtimeId,plan); const cinema=provider.getCinema(showtime?.cinemaId);
  const route=provider.getRoute(restaurant?.locationId,cinema?.locationId); const transport=provider.getTransportOption(route,selected.transportOptionId);
  const checks:FeasibilityCheck[]=[];
  checks.push(check('complete','Plan completeness',Boolean(restaurant&&selected.restaurantSlot&&movie&&showtime&&cinema&&transport),restaurant&&selected.restaurantSlot&&movie&&showtime&&cinema&&transport?'All required services are selected.':'Restaurant slot, movie showtime, and route transport are all required.'));
  checks.push(check('city','City consistency',Boolean(restaurant?.city===plan.city&&cinema?.city===plan.city),restaurant&&cinema?`${restaurant.city} restaurant and ${cinema.city} cinema match ${plan.city}.`:'Selected providers must exist in the plan city.'));
  const slot=restaurant&&provider.restaurantSlots(restaurant,plan.date,plan).find(item=>item.time===selected.restaurantSlot);
  const ownsRestaurant=slot?.inventoryState==='committed_to_current_plan'&&(slot.committedQuantity??0)>=plan.people;
  const restaurantAvailable=Boolean(slot&&restaurant&&(ownsRestaurant||slot.capacityRemaining>=plan.people)&&plan.people>=restaurant.minParty&&plan.people<=restaurant.maxParty);
  checks.push(check('restaurant_availability','Restaurant availability',restaurantAvailable,ownsRestaurant?`${plan.people} seats at ${slot?.time} are committed to this plan.`:slot?`${slot.capacityRemaining} seats remain at ${slot.time}; ${plan.people} requested.`:'Selected restaurant slot is unavailable for this date.'));
  const ownsShowtime=showtime?.inventoryState==='committed_to_current_plan'&&(showtime.committedQuantity??0)>=plan.people;
  const showtimeValid=Boolean(showtime&&movie&&showtime.movieId===movie.id&&showtime.date===plan.date&&(ownsShowtime||showtime.seatsRemaining>=plan.people));
  checks.push(check('showtime_integrity','Movie and showtime integrity',showtimeValid,showtime&&movie?ownsShowtime?`${plan.people} seats for ${movie.title} are committed to this plan.`:`${showtime.id} belongs to ${movie.title} on ${showtime.date}; ${showtime.seatsRemaining} seats remain.`:'Showtime must belong to the selected movie, date, and have enough seats.'));
  const persistedReservation=provider.getReservation(plan);const reservationConsistent=plan.status!=='reserved'||Boolean(plan.reservation?.status==='confirmed'&&plan.reservation.planId===plan.id&&plan.reservation.version===plan.version&&persistedReservation?.id===plan.reservation.id);
  checks.push(check('reservation_integrity','Reservation ownership',reservationConsistent,plan.status==='reserved'?(reservationConsistent?'Provider commitment belongs to this exact plan version.':'Reserved state has no matching provider commitment.'):'No provider commitment is required before reservation.'));
  checks.push(check('route','Route availability',Boolean(route&&transport),route&&transport?`${route.distanceKm.toFixed(1)} km via ${transport.name}, ${transport.durationMinutes} minutes.`:'No verified route and transport option connects the selected venues.'));
  let timeline:PlanEvaluation['timeline']=null;
  if(selected.restaurantSlot&&showtime&&movie&&transport){
    const dinnerStart=minutes(selected.restaurantSlot); const dinnerEnd=dinnerStart+plan.dinnerDurationMinutes; const arriveAt=dinnerEnd+transport.durationMinutes; const readyAt=arriveAt+plan.bufferMinutes; const movieStart=minutes(showtime.startTime); const slack=movieStart-readyAt;
    timeline={dinnerStart:formatTime(dinnerStart),dinnerEnd:formatTime(dinnerEnd),departAt:formatTime(dinnerEnd),arriveAt:formatTime(arriveAt),movieStart:showtime.startTime,movieEnd:formatTime(movieStart+movie.durationMinutes),slackMinutes:slack};
    const policy=TIMING_POLICY[plan.preferences.timing];const chronologyValid=slack>=0&&slack<=policy.maxSlackMinutes;
    checks.push(check('chronology','Schedule chronology',chronologyValid,slack<0?`Movie starts ${Math.abs(slack)} minutes before the required arrival buffer.`:slack>policy.maxSlackMinutes?`${slack} idle minutes exceeds the ${policy.maxSlackMinutes}-minute ${plan.preferences.timing} timing limit.`:`${slack} minutes of slack remain after travel and the ${plan.bufferMinutes}-minute arrival buffer.`));
  }else checks.push(check('chronology','Schedule chronology',false,'A complete dinner, route, and showtime are required to calculate chronology.'));
  const restaurantCost=restaurant?restaurant.pricePerPerson*plan.people:null; const movieCost=showtime&&showtimeValid?showtime.price*plan.people:null; const transportCost=transport?.fare??null;
  const completeCosts=restaurantCost!==null&&movieCost!==null&&transportCost!==null; const total=completeCosts?restaurantCost+movieCost+transportCost:null;
  const costs={restaurant:restaurantCost,movie:movieCost,transport:transportCost,total,remainingBudget:total===null?null:plan.budget-total};
  checks.push(check('budget','Budget',total!==null&&total<=plan.budget,total===null?'Complete valid selections are required for a reliable total.':total<=plan.budget?`৳${total.toLocaleString()} of ৳${plan.budget.toLocaleString()}; ৳${(plan.budget-total).toLocaleString()} remains.`:`Budget exceeded by ৳${(total-plan.budget).toLocaleString()}.`));
  return {valid:checks.filter(item=>item.blocking).every(item=>item.passed),providerRevision:provider.revision,checks,costs,timeline};
}

export function snapshotPlan(plan:Plan,provider:InventoryProvider=demoProvider):PlanSnapshot{
  const restaurantSource=provider.getRestaurant(plan.selections.restaurantId);const restaurant=restaurantSource?{...restaurantSource,slots:provider.restaurantSlots(restaurantSource,plan.date,plan)}:null; const movie=provider.getMovie(plan.selections.movieId)??null;
  const showtime=provider.showtimeSnapshot(plan.selections.showtimeId,plan)??null; const cinema=provider.getCinema(showtime?.cinemaId)??null;
  const route=provider.getRoute(restaurant?.locationId,cinema?.locationId)??null; const transport=provider.getTransportOption(route??undefined,plan.selections.transportOptionId)??null;
  return {plan,evaluation:evaluatePlan(plan,provider),restaurant,movie,showtime,cinema,route,transport};
}

function scorePlan(plan:Plan,evaluation:PlanEvaluation,provider:InventoryProvider){
  const restaurant=provider.getRestaurant(plan.selections.restaurantId)!; const movie=provider.getMovie(plan.selections.movieId)!; const showtime=provider.getShowtime(plan.selections.showtimeId)!; const cinema=provider.getCinema(showtime.cinemaId)!; const transport=provider.getTransportOption(provider.getRoute(restaurant.locationId,cinema.locationId),plan.selections.transportOptionId)!;
  let score=restaurant.rating*18+movie.rating*7;
  if(plan.preferences.cuisine&&restaurant.cuisine.toLowerCase().includes(plan.preferences.cuisine.toLowerCase()))score+=45;
  if(plan.preferences.movieGenre&&movie.genre.toLowerCase().includes(plan.preferences.movieGenre.toLowerCase()))score+=35;
  if(plan.preferences.transport==='comfortable'&&transport.kind==='comfort')score+=25;
  if(plan.preferences.transport==='fastest')score-=transport.durationMinutes;
  if(plan.preferences.transport==='lowest_cost')score-=transport.fare/30;
  if(plan.preferences.priority==='lowest_cost')score-=(evaluation.costs.total??0)/80;
  if(plan.preferences.priority==='highest_rated')score+=restaurant.rating*12+movie.rating*4;
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
        const cinema=provider.getCinema(showtime.cinemaId)!; const route=provider.getRoute(restaurant.locationId,cinema.locationId); if(!route)continue;
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

export function createBlankPlan(overrides?:Partial<Pick<Plan,'city'|'date'|'people'|'budget'>>):Plan{return {...initialPlan(),...overrides,preferences:defaultPreferences()};}
export function applyPlanUpdate(plan:Plan,input:unknown,provider:InventoryProvider=demoProvider):ToolResult<{plan:Plan;evaluation:PlanEvaluation;clearedDependencies:string[];changed:boolean}>{
  const parsed=parseInput(updatePlanSchema,input);if(!parsed.ok)return parsed;const change:PlanUpdate=parsed.data;
  if(change.expectedVersion!==plan.version)return fail('STALE_PLAN_VERSION',`Expected version ${change.expectedVersion}, but current version is ${plan.version}.`,'expectedVersion',true);
  if(plan.status==='reserved'||plan.status==='reservation_pending')return fail('PLAN_IMMUTABLE',plan.status==='reserved'?'A confirmed simulated reservation is immutable. Start a new plan to make changes.':'Wait for the pending reservation attempt to finish.');
  const changed=change.budget!==undefined&&change.budget!==plan.budget||change.people!==undefined&&change.people!==plan.people||change.preferences!==undefined&&JSON.stringify(change.preferences)!==JSON.stringify(plan.preferences)||change.restaurantId!==undefined&&(change.restaurantId!==plan.selections.restaurantId||change.restaurantSlot!==plan.selections.restaurantSlot)||change.movieId!==undefined&&(change.movieId!==plan.selections.movieId||change.showtimeId!==plan.selections.showtimeId)||change.transportOptionId!==undefined&&change.transportOptionId!==plan.selections.transportOptionId;
  if(!changed)return ok({plan,evaluation:evaluatePlan(plan,provider),clearedDependencies:[],changed:false});
  const next:Plan={...plan,selections:{...plan.selections},version:plan.version+1,status:'draft',approval:undefined,reservation:undefined,updatedAt:newTimestamp(),changeSummary:'Updated the shared draft'}; const clearedDependencies:string[]=[];
  if(change.budget!==undefined)next.budget=change.budget; if(change.people!==undefined)next.people=change.people; if(change.preferences)next.preferences=change.preferences;
  if(change.restaurantId&&change.restaurantSlot){const restaurant=provider.getRestaurant(change.restaurantId);if(!restaurant)return fail('UNKNOWN_RESTAURANT','Restaurant ID was not found.','restaurantId',true);const slot=provider.availableRestaurantSlots(restaurant,next.date,next.people).find(item=>item.time===change.restaurantSlot);if(!slot)return fail('INVALID_RESTAURANT_SLOT','The selected slot is unavailable for this restaurant, date, and party size.','restaurantSlot',true);next.selections.restaurantId=restaurant.id;next.selections.restaurantSlot=slot.time;}
  if(change.movieId&&change.showtimeId){const movie=provider.getMovie(change.movieId);const showtime=provider.getShowtime(change.showtimeId);if(!movie)return fail('UNKNOWN_MOVIE','Movie ID was not found.','movieId',true);if(!showtime)return fail('UNKNOWN_SHOWTIME','Showtime ID was not found.','showtimeId',true);if(showtime.movieId!==movie.id)return fail('MOVIE_SHOWTIME_MISMATCH','Showtime does not belong to the selected movie.','showtimeId',true);if(showtime.date!==next.date)return fail('SHOWTIME_DATE_MISMATCH','Showtime does not match the plan date.','showtimeId',true);next.selections.movieId=movie.id;next.selections.showtimeId=showtime.id;}
  const restaurant=provider.getRestaurant(next.selections.restaurantId);const showtime=provider.getShowtime(next.selections.showtimeId);const cinema=provider.getCinema(showtime?.cinemaId);const route=provider.getRoute(restaurant?.locationId,cinema?.locationId);
  if(change.transportOptionId){if(!provider.getTransportOption(route,change.transportOptionId))return fail('INVALID_TRANSPORT_OPTION','Transport option does not belong to the selected venue route.','transportOptionId',true);next.selections.transportOptionId=change.transportOptionId;}
  else if(next.selections.transportOptionId&&!provider.getTransportOption(route,next.selections.transportOptionId)){delete next.selections.transportOptionId;clearedDependencies.push('transportOptionId');}
  const evaluation=evaluatePlan(next,provider);next.status=evaluation.valid?'valid':'draft';return ok({plan:next,evaluation,clearedDependencies,changed:true});
}

export function repairPlan(plan:Plan,input:{expectedVersion:number;preserveRestaurant:boolean;preserveMovie:boolean},provider:InventoryProvider=demoProvider):PlannerResult{
  if(input.expectedVersion!==plan.version)return {ok:false,error:{code:'STALE_PLAN_VERSION',message:`Expected version ${input.expectedVersion}, but current version is ${plan.version}.`,field:'expectedVersion',retryable:true}};
  if(plan.status==='reserved')return {ok:false,error:{code:'PLAN_ALREADY_RESERVED',message:'Reserved plans cannot be repaired.',retryable:false}};
  const result=solvePlan({city:'Dhaka',date:plan.date,people:plan.people,budget:plan.budget,preferences:plan.preferences,dinnerDurationMinutes:plan.dinnerDurationMinutes,bufferMinutes:plan.bufferMinutes},plan.version,{restaurantId:input.preserveRestaurant?plan.selections.restaurantId:undefined,restaurantSlot:input.preserveRestaurant?plan.selections.restaurantSlot:undefined,movieId:input.preserveMovie?plan.selections.movieId:undefined,showtimeId:input.preserveMovie?plan.selections.showtimeId:undefined},provider);
  return result.ok?{...result,plan:{...result.plan,changeSummary:'Repaired the plan and recalculated dependent choices'}}:result;
}

export const hasActiveReservation=(plan:Plan)=>plan.status==='reserved'&&plan.reservation?.status==='confirmed';
export function startNewPlan(plan:Plan,expectedVersion:number,provider:InventoryProvider=demoProvider):ToolResult<{plan:Plan;archivedReservation?:Reservation;reservationLedger:Reservation[]}>{
  if(expectedVersion!==plan.version)return fail('STALE_PLAN_VERSION',`Expected version ${expectedVersion}, but current version is ${plan.version}.`,'expectedVersion',true);
  if(plan.status==='reservation_pending')return fail('RESERVATION_IN_PROGRESS','A reservation attempt is still resolving. Retry once it settles.',undefined,true);
  const archivedReservation=hasActiveReservation(plan)?plan.reservation:undefined;
  const next:Plan={...createBlankPlan({city:plan.city,date:plan.date,people:plan.people,budget:plan.budget}),preferences:plan.preferences,version:plan.version+1,status:'draft',updatedAt:newTimestamp(),changeSummary:archivedReservation?`Started a new plan; reservation ${archivedReservation.id} stays committed to version ${archivedReservation.version}`:'Started a new plan'};
  return ok({plan:next,archivedReservation,reservationLedger:provider.listReservations()});
}

export function approvePlan(plan:Plan,expectedVersion:number,provider:InventoryProvider=demoProvider):ToolResult<{plan:Plan;evaluation:PlanEvaluation}>{
  if(expectedVersion!==plan.version)return fail('STALE_PLAN_VERSION',`Expected version ${expectedVersion}, but current version is ${plan.version}.`,'expectedVersion',true);
  if(plan.status==='reserved')return fail('PLAN_ALREADY_RESERVED','This plan already has a simulated reservation.');
  const evaluation=evaluatePlan(plan,provider);if(!evaluation.valid)return fail('PLAN_INVALID','Approval blocked until every feasibility check passes.',undefined,true,evaluation.checks.filter(item=>!item.passed).map(item=>item.message));
  return ok({plan:{...plan,status:'approved',approval:{version:plan.version,providerRevision:provider.revision,approvedAt:newTimestamp()},updatedAt:newTimestamp(),changeSummary:`Human approved version ${plan.version}`},evaluation});
}

export type ReservationResult={ok:true;data:{plan:Plan;reservationId:string;message:string;idempotent:boolean;transitions:string[]}}|{ok:false;error:ToolError;plan?:Plan;transitions?:string[]};
export async function reservePlan(plan:Plan,expectedVersion:number,provider:InventoryProvider=demoProvider,onPending?:(plan:Plan)=>void|Promise<void>,authority:ReservationAuthority=new LocalReservationAuthority(provider)):Promise<ReservationResult>{
  if(expectedVersion!==plan.version)return fail('STALE_PLAN_VERSION',`Expected version ${expectedVersion}, but current version is ${plan.version}.`,'expectedVersion',true);
  if(plan.status==='reserved'&&plan.reservation?.status==='confirmed')return {ok:true,data:{plan,reservationId:plan.reservation.id,message:'The existing sandbox confirmation was returned without consuming inventory again.',idempotent:true,transitions:['reserved']}};
  if(plan.status!=='approved'||plan.approval?.version!==plan.version)return fail('HUMAN_APPROVAL_REQUIRED','The human must approve this exact valid version in the UI first.',undefined,true);
  if(plan.approval.providerRevision!==provider.revision)return fail('PROVIDER_STATE_CHANGED','Provider inventory changed after approval. Revalidate and approve the current version again.',undefined,true);
  const evaluation=evaluatePlan(plan,provider);if(!evaluation.valid)return fail('PLAN_INVALID','Reservation blocked because the plan is no longer valid.',undefined,true,evaluation.checks.filter(item=>!item.passed).map(item=>item.message));
  const idempotencyKey=`${plan.id}:v${plan.version}`;const selectedRestaurant=provider.getRestaurant(plan.selections.restaurantId);const selectedSlot=selectedRestaurant&&provider.restaurantSlots(selectedRestaurant,plan.date).find(item=>item.time===plan.selections.restaurantSlot);const selectedShowtime=provider.getShowtime(plan.selections.showtimeId);
  const pendingReservation:Reservation={id:`PENDING-${plan.id.toUpperCase()}-V${plan.version}`,planId:plan.id,version:plan.version,providerRevision:provider.revision,status:'pending',reservedAt:newTimestamp(),idempotencyKey,inventory:[...(selectedRestaurant&&selectedSlot?[{kind:'restaurant' as const,inventoryKey:`${selectedRestaurant.id}|${plan.date}|${selectedSlot.time}`,quantity:plan.people,state:'held' as const}]:[]),...(selectedShowtime?[{kind:'showtime' as const,inventoryKey:selectedShowtime.id,quantity:plan.people,state:'held' as const}]:[])]};
  const pendingPlan:Plan={...plan,status:'reservation_pending',reservation:pendingReservation,updatedAt:newTimestamp(),changeSummary:'Sandbox reservation pending'};
  if(onPending)await onPending(pendingPlan);
  const providerResult=await authority.commit(pendingPlan);
  if(providerResult.ok&&providerResult.data.providerState)provider.importState(providerResult.data.providerState);if(!providerResult.ok){const failedReservation:Reservation={...pendingReservation,status:'failed',inventory:pendingReservation.inventory.map(item=>({...item,state:'released'})),failureCode:providerResult.error.code};const failedPlan:Plan={...plan,status:'reservation_failed',approval:undefined,reservation:failedReservation,updatedAt:newTimestamp(),changeSummary:`Sandbox reservation failed: ${providerResult.error.code}`};return {ok:false,error:providerResult.error,plan:failedPlan,transitions:['approved','reservation_pending','reservation_failed']};}
  const reservation=providerResult.data.reservation;const next:Plan={...plan,status:'reserved',reservation,updatedAt:newTimestamp(),changeSummary:`Created sandbox reservation ${reservation.id}`};
  return {ok:true,data:{plan:next,reservationId:reservation.id,idempotent:providerResult.data.idempotent,transitions:['approved','reservation_pending','reserved'],message:'Sandbox provider confirmation created. Inventory was committed to this plan; no real business, payment, or ride service was contacted.'}};
}
export const domainError=(code:string,message:string):ToolError=>({code,message,retryable:false});
