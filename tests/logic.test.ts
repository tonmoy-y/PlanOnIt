// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { approvePlan, evaluatePlan, reservePlan, solvePlan } from '../src/domain';
import { defaultPreferences, restaurants, routes } from '../src/data';
import { MutableDemoProvider } from '../src/providers';
import { loadState, OWNED_STORAGE_KEYS, resetWorkspace, saveState, STORAGE_KEY } from '../src/persistence';
import { buildTools, resultErrorCode } from '../src/tools';
import { Plan, Preferences } from '../src/types';

const constraints=(overrides:Partial<{people:number;budget:number;preferences:Preferences}>={})=>({city:'Dhaka' as const,date:'2026-09-04',people:3,budget:7000,preferences:defaultPreferences(),dinnerDurationMinutes:75,bufferMinutes:15,...overrides});
const CINEMA_AREAS=['bashundhara-city','jamuna-future-park'];

describe('travel runs cinema to restaurant',()=>{
  it('stores a route for the direction the evening is actually travelled',()=>{
    for(const cinemaArea of CINEMA_AREAS)
      expect(routes.some(route=>route.fromLocationId===cinemaArea),`no route leaves ${cinemaArea}`).toBe(true);
    for(const route of routes){
      const mirror=routes.find(item=>item.fromLocationId===route.toLocationId&&item.toLocationId===route.fromLocationId);
      expect(mirror,`missing mirror for ${route.id}`).toBeDefined();
      expect(mirror!.distanceKm).toBe(route.distanceKm);
    }
  });

  it('selects a transport option that belongs to the cinema→restaurant leg',()=>{
    const provider=new MutableDemoProvider();
    const solved=solvePlan(constraints(),0,undefined,provider);
    expect(solved.ok).toBe(true);
    if(!solved.ok)return;
    const showtime=provider.getShowtime(solved.plan.selections.showtimeId)!;
    const cinema=provider.getCinema(showtime.cinemaId)!;
    const restaurant=provider.getRestaurant(solved.plan.selections.restaurantId)!;
    const route=provider.getRoute(cinema.locationId,restaurant.locationId);
    expect(route,'the planner must resolve a route from the cinema to the restaurant').toBeDefined();
    expect(route!.options.some(option=>option.id===solved.plan.selections.transportOptionId)).toBe(true);
    expect(solved.plan.selections.transportOptionId!.startsWith(`${cinema.locationId}--${restaurant.locationId}`)).toBe(true);
  });

  it('answers estimate_transport for the journey an agent following the timeline would ask about',async()=>{
    const provider=new MutableDemoProvider();
    let plan:Plan=solvePlan(constraints(),0,undefined,provider).ok?(solvePlan(constraints(),0,undefined,provider) as {ok:true;plan:Plan}).plan:({} as Plan);
    const tools=buildTools(()=>plan,next=>{plan=next;},provider);
    const estimate=tools.find(tool=>tool.name==='estimate_transport')!;
    const leg=await estimate.execute({fromLocationId:'bashundhara-city',toLocationId:'dhanmondi-27'}) as {ok:true;data:{distanceKm:number;options:unknown[]}};
    expect(leg.ok,'cinema → restaurant must be a known route').toBe(true);
    expect(leg.data.distanceKm).toBe(6.2);
    expect(leg.data.options).toHaveLength(3);
    // genuinely unconnected pairs still fail
    expect(resultErrorCode(await estimate.execute({fromLocationId:'bashundhara-city',toLocationId:'jamuna-future-park'}))).toBe('ROUTE_NOT_FOUND');
    expect(resultErrorCode(await estimate.execute({fromLocationId:'mars',toLocationId:'moon'}))).toBe('UNKNOWN_LOCATION');
  });
});

describe('the priority preference changes the outcome',()=>{
  const winner=(preferences:Partial<Preferences>)=>{
    const provider=new MutableDemoProvider();
    const result=solvePlan(constraints({preferences:{...defaultPreferences(),...preferences}}),0,undefined,provider);
    if(!result.ok)throw new Error('no feasible plan');
    return {plan:result.plan,total:result.evaluation.costs.total!,restaurant:provider.getRestaurant(result.plan.selections.restaurantId)!};
  };

  it('lowest_cost never costs more than balanced, and highest_rated never rates lower',()=>{
    const balanced=winner({priority:'balanced'});
    const cheapest=winner({priority:'lowest_cost'});
    const best=winner({priority:'highest_rated'});
    expect(cheapest.total).toBeLessThanOrEqual(balanced.total);
    expect(best.restaurant.rating).toBeGreaterThanOrEqual(balanced.restaurant.rating);
    // and the preference is decisive, not merely tolerated
    expect(cheapest.total).toBeLessThan(best.total);
  });

  it('is honoured for every party size the sandbox supports',()=>{
    for(const people of [1,2,5]){
      const provider=new MutableDemoProvider();
      const cheap=solvePlan(constraints({people,budget:12000,preferences:{...defaultPreferences(),priority:'lowest_cost'}}),0,undefined,provider);
      const rated=solvePlan(constraints({people,budget:12000,preferences:{...defaultPreferences(),priority:'highest_rated'}}),0,undefined,provider);
      expect(cheap.ok&&rated.ok,`no plan for ${people}`).toBe(true);
      if(!cheap.ok||!rated.ok)continue;
      expect(cheap.evaluation.costs.total!).toBeLessThanOrEqual(rated.evaluation.costs.total!);
    }
  });

  it('keeps the advertised price band consistent with what a plan actually charges',()=>{
    const provider=new MutableDemoProvider();
    for(const restaurant of restaurants){
      expect(restaurant.priceRangeMin).toBeLessThanOrEqual(restaurant.pricePerPerson);
      expect(restaurant.pricePerPerson).toBeLessThanOrEqual(restaurant.priceRangeMax);
    }
    const solved=solvePlan(constraints(),0,undefined,provider);
    if(!solved.ok)throw new Error('no plan');
    const restaurant=provider.getRestaurant(solved.plan.selections.restaurantId)!;
    const perPerson=solved.evaluation.costs.restaurant!/solved.plan.people;
    expect(perPerson).toBeGreaterThanOrEqual(restaurant.priceRangeMin);
    expect(perPerson).toBeLessThanOrEqual(restaurant.priceRangeMax);
  });
});

describe('starting fresh',()=>{
  beforeEach(()=>localStorage.clear());
  const reservedPlan=async(provider:MutableDemoProvider)=>{
    const solved=solvePlan(constraints({budget:5000}),0,undefined,provider);if(!solved.ok)throw new Error('solve');
    const approved=approvePlan(solved.plan,solved.plan.version,provider);if(!approved.ok)throw new Error('approve');
    const reserved=await reservePlan(approved.data.plan,approved.data.plan.version,provider);if(!reserved.ok)throw new Error('reserve');
    return reserved.data.plan;
  };

  it('refuses while a reservation is still resolving',()=>{
    const provider=new MutableDemoProvider();
    const solved=solvePlan(constraints(),0,undefined,provider);if(!solved.ok)throw new Error('solve');
    const pending:Plan={...solved.plan,status:'reservation_pending'};
    saveState(pending,[],provider.exportState());
    const result=resetWorkspace(pending,provider.exportState());
    expect(result.ok).toBe(false);
    if(!result.ok)expect(result.error.code).toBe('RESERVATION_IN_PROGRESS');
    expect(loadState().plan.status,'the pending plan must survive a refused reset').toBe('reservation_pending');
  });

  it('clears only PlanOnIt keys and never cancels a confirmed reservation',async()=>{
    const provider=new MutableDemoProvider();
    const plan=await reservedPlan(provider);
    saveState(plan,[],provider.exportState());
    localStorage.setItem('some-other-site','keep me');
    const result=resetWorkspace(plan,provider.exportState());
    expect(result.ok).toBe(true);
    if(!result.ok)return;
    expect(localStorage.getItem('some-other-site')).toBe('keep me');
    for(const key of OWNED_STORAGE_KEYS)if(key!==STORAGE_KEY)expect(localStorage.getItem(key)).toBeNull();
    expect(result.data.plan.status).toBe('draft');
    expect(result.data.plan.selections).toEqual({});
    expect(result.data.plan.version).toBe(plan.version+1);
    expect(result.data.activity).toEqual([]);
    // the commitment itself is untouched
    expect(Object.keys(result.data.provider?.reservations??{})).toHaveLength(1);
    expect(provider.listReservations()[0].status).toBe('confirmed');
  });

  it('survives a reload, repeats safely, and leaves a plannable workspace',async()=>{
    const provider=new MutableDemoProvider();
    const plan=await reservedPlan(provider);
    saveState(plan,[],provider.exportState());
    const first=resetWorkspace(plan,provider.exportState());
    if(!first.ok)throw new Error('reset failed');
    const reloaded=loadState();
    expect(reloaded.plan.version).toBe(first.data.plan.version);
    expect(Object.keys(reloaded.provider?.reservations??{})).toHaveLength(1);
    const second=resetWorkspace(reloaded.plan,reloaded.provider);
    expect(second.ok).toBe(true);
    if(!second.ok)return;
    expect(second.data.plan.version).toBe(reloaded.plan.version+1);
    const solved=solvePlan({...constraints(),date:second.data.plan.date},second.data.plan.version,undefined,provider);
    expect(solved.ok,'a reset workspace must be immediately plannable').toBe(true);
  });

  it('a reset workspace no longer reports the old reservation as current',async()=>{
    const provider=new MutableDemoProvider();
    const plan=await reservedPlan(provider);
    const result=resetWorkspace(plan,provider.exportState());
    if(!result.ok)throw new Error('reset failed');
    expect(result.data.plan.reservation).toBeUndefined();
    expect(evaluatePlan(result.data.plan,provider).checks.find(item=>item.id==='reservation_integrity')?.passed).toBe(true);
  });
});
