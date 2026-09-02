import { describe, expect, it } from 'vitest';
import { applyPlanUpdate, approvePlan, evaluatePlan, isPlanImmutable, repairPlan, reservationOwnership, reservePlan, solvePlan, startNewPlan } from '../src/domain';
import { defaultPreferences, restaurants } from '../src/data';
import { reservationFingerprint } from '../src/intent';
import { MutableDemoProvider } from '../src/providers';
import { ReservationAuthority } from '../src/authority';
import { buildTools, resultErrorCode } from '../src/tools';
import { Plan, ProviderState, Reservation } from '../src/types';

const constraints={city:'Dhaka' as const,date:'2026-09-04',people:3,budget:5000,preferences:defaultPreferences(),dinnerDurationMinutes:75,bufferMinutes:15};
function approved(provider:MutableDemoProvider,overrides:Partial<typeof constraints>={}){
  const solved=solvePlan({...constraints,...overrides},0,undefined,provider);if(!solved.ok)throw new Error(solved.error.message);
  const result=approvePlan(solved.plan,solved.plan.version,provider);if(!result.ok)throw new Error(result.error.message);
  return result.data.plan;
}
async function reserved(provider:MutableDemoProvider){
  const plan=approved(provider);const result=await reservePlan(plan,plan.version,provider);
  if(!result.ok)throw new Error(result.error.message);
  return result.data.plan;
}
/** An authority that lets the test run code while the commitment is in flight. */
class DelayedAuthority implements ReservationAuthority{
  readonly kind='local' as const;
  constructor(private readonly provider:MutableDemoProvider,private readonly during:()=>void|Promise<void>,private readonly outcome:'ok'|'fail'|'timeout'='ok'){}
  async commit(plan:Plan){
    await this.during();
    await new Promise(resolve=>setTimeout(resolve,1));
    if(this.outcome==='fail')return {ok:false as const,error:{code:'PROVIDER_UNAVAILABLE',message:'authority refused',retryable:true}};
    if(this.outcome==='timeout')return {ok:false as const,error:{code:'AUTHORITY_UNREACHABLE',message:'authority timed out',retryable:true}};
    return this.provider.reserve(plan);
  }
}

describe('BUG-1 — reservation_pending is immutable and cannot be raced',()=>{
  it('treats reservation_pending exactly like reserved in the lifecycle predicate',()=>{
    const provider=new MutableDemoProvider();const plan=approved(provider);
    expect(isPlanImmutable({...plan,status:'reservation_pending'})).toBe(true);
    expect(isPlanImmutable({...plan,status:'reserved'})).toBe(true);
    expect(isPlanImmutable(plan)).toBe(false);
  });
  it('blocks every mutation path while a reservation is pending',async()=>{
    const provider=new MutableDemoProvider();const base=approved(provider);
    const pending:Plan={...base,status:'reservation_pending'};
    expect(resultErrorCode(applyPlanUpdate(pending,{expectedVersion:pending.version,budget:5200},provider))).toBe('RESERVATION_IN_PROGRESS');
    expect(repairPlan(pending,{expectedVersion:pending.version,preserveRestaurant:true,preserveMovie:false},provider)).toMatchObject({ok:false,error:{code:'RESERVATION_IN_PROGRESS'}});
    expect(approvePlan(pending,pending.version,provider)).toMatchObject({ok:false,error:{code:'RESERVATION_IN_PROGRESS'}});
    expect(startNewPlan(pending,pending.version,provider)).toMatchObject({ok:false,error:{code:'RESERVATION_IN_PROGRESS'}});
    expect(await reservePlan(pending,pending.version,provider)).toMatchObject({ok:false,error:{code:'RESERVATION_IN_PROGRESS'}});
  });
  it('blocks the WebMCP mutation tools while a reservation is pending',async()=>{
    const provider=new MutableDemoProvider();let plan:Plan={...approved(provider),status:'reservation_pending'};
    const tools=buildTools(()=>plan,next=>{plan=next;},provider);
    const call=(name:string,input:unknown)=>tools.find(tool=>tool.name===name)!.execute(input);
    expect(resultErrorCode(await call('create_evening_plan',constraints))).toBe('RESERVATION_IN_PROGRESS');
    expect(resultErrorCode(await call('update_plan',{expectedVersion:plan.version,budget:5300}))).toBe('RESERVATION_IN_PROGRESS');
    expect(resultErrorCode(await call('repair_plan',{expectedVersion:plan.version}))).toBe('RESERVATION_IN_PROGRESS');
    expect(resultErrorCode(await call('reserve_plan',{expectedVersion:plan.version,confirmation:'CONFIRM_SIMULATED_RESERVATION'}))).toBe('RESERVATION_IN_PROGRESS');
    expect(resultErrorCode(await call('start_new_plan',{expectedVersion:plan.version}))).toBe('RESERVATION_IN_PROGRESS');
    expect(plan.status).toBe('reservation_pending');
  });
  it('never writes an older reservation result over a newer plan version',async()=>{
    const provider=new MutableDemoProvider();const plan=approved(provider);
    let live:Plan=plan;
    const authority=new DelayedAuthority(provider,()=>{live={...plan,version:plan.version+1,status:'draft',budget:6000,approval:undefined};});
    const result=await reservePlan(plan,plan.version,provider,async pending=>{live=pending;},authority,()=>live);
    expect(result.ok).toBe(false);
    if(result.ok)return;
    expect(result.error.code).toBe('RESERVATION_STATE_CHANGED');
    expect(result.plan).toBeUndefined();
    expect(live.version).toBe(plan.version+1);
    expect(live.status).toBe('draft');
  });
  it('fails safely when the selections change under an in-flight reservation',async()=>{
    const provider=new MutableDemoProvider();const plan=approved(provider);
    const other=restaurants.find(item=>item.id!==plan.selections.restaurantId)!;
    let live:Plan=plan;
    const authority=new DelayedAuthority(provider,()=>{live={...live,selections:{...live.selections,restaurantId:other.id}};});
    const result=await reservePlan(plan,plan.version,provider,async pending=>{live=pending;},authority,()=>live);
    expect(result).toMatchObject({ok:false,error:{code:'RESERVATION_STATE_CHANGED'}});
  });
  it('fails safely when the date or party size changes under an in-flight reservation',async()=>{
    for(const mutate of [(current:Plan)=>({...current,date:'2026-09-05'}),(current:Plan)=>({...current,people:current.people+1})]){
      const provider=new MutableDemoProvider();const plan=approved(provider);
      let live:Plan=plan;
      const authority=new DelayedAuthority(provider,()=>{live=mutate(live);});
      expect(await reservePlan(plan,plan.version,provider,async pending=>{live=pending;},authority,()=>live)).toMatchObject({ok:false,error:{code:'RESERVATION_STATE_CHANGED'}});
    }
  });
  it('still succeeds and never regresses the version when nothing moves',async()=>{
    const provider=new MutableDemoProvider();const plan=approved(provider);
    let live:Plan=plan;
    const authority=new DelayedAuthority(provider,()=>undefined);
    const result=await reservePlan(plan,plan.version,provider,async pending=>{live=pending;},authority,()=>live);
    expect(result.ok).toBe(true);
    if(!result.ok)return;
    expect(result.data.plan.version).toBe(plan.version);
    expect(result.data.plan.status).toBe('reserved');
    expect(evaluatePlan(result.data.plan,provider).valid).toBe(true);
  });
  it('records a failed attempt without consuming inventory when the authority refuses or times out',async()=>{
    for(const outcome of ['fail','timeout'] as const){
      const provider=new MutableDemoProvider();const plan=approved(provider);
      let live:Plan=plan;
      const authority=new DelayedAuthority(provider,()=>undefined,outcome);
      const result=await reservePlan(plan,plan.version,provider,async pending=>{live=pending;},authority,()=>live);
      expect(result.ok).toBe(false);
      if(result.ok)return;
      expect(result.plan?.status).toBe('reservation_failed');
      expect(result.plan?.version).toBe(plan.version);
      expect(result.plan?.reservation?.inventory.every(item=>item.state==='released')).toBe(true);
      expect(provider.revision).toBe(0);
      expect(provider.listReservations()).toHaveLength(0);
    }
  });
});

describe('BUG-2 — idempotency is bound to the reservation content',()=>{
  const variants:Array<[string,(plan:Plan)=>Plan]>=[
    ['a different restaurant',plan=>({...plan,selections:{...plan.selections,restaurantId:restaurants.find(item=>item.id!==plan.selections.restaurantId)!.id}})],
    ['a different restaurant slot',plan=>({...plan,selections:{...plan.selections,restaurantSlot:plan.selections.restaurantSlot==='20:00'?'20:30':'20:00'}})],
    ['a different movie and showtime',plan=>({...plan,selections:{...plan.selections,movieId:'laugh-track',showtimeId:'lt-2026-09-04-1715'}})],
    ['a different showtime of the same movie',plan=>({...plan,selections:{...plan.selections,showtimeId:'pm-2026-09-04-1700'}})],
    ['a different date',plan=>({...plan,date:'2026-09-05'})],
    ['a different party size',plan=>({...plan,people:plan.people+1})],
    ['a different transport option',plan=>({...plan,selections:{...plan.selections,transportOptionId:`${plan.selections.transportOptionId}-x`}})],
  ];
  it('produces one stable fingerprint for one unchanged intent',async()=>{
    const provider=new MutableDemoProvider();const plan=await reserved(provider);
    expect(reservationFingerprint(plan,provider)).toBe(reservationFingerprint({...plan},provider));
    expect(plan.reservation?.fingerprint).toBe(reservationFingerprint(plan,provider));
    expect(plan.reservation?.idempotencyKey).toBe(plan.reservation?.fingerprint);
  });
  it('replays the identical intent without consuming inventory twice',async()=>{
    const provider=new MutableDemoProvider();const plan=await reserved(provider);
    const revision=provider.revision;
    const replay=provider.reserve(plan);
    expect(replay).toMatchObject({ok:true,data:{idempotent:true}});
    expect(provider.revision).toBe(revision);
    expect(provider.listReservations()).toHaveLength(1);
  });
  it.each(variants)('refuses to replay the reservation for %s',async(_name,mutate)=>{
    const provider=new MutableDemoProvider();const plan=await reserved(provider);
    const forged=mutate(plan);
    expect(reservationFingerprint(forged,provider)).not.toBe(reservationFingerprint(plan,provider));
    const replay=provider.reserve(forged);
    expect(replay).toMatchObject({ok:false,error:{code:'RESERVATION_INTENT_MISMATCH'}});
    expect(provider.listReservations()).toHaveLength(1);
    expect(provider.listReservations()[0].fingerprint).toBe(plan.reservation?.fingerprint);
  });
  it('refuses to replay through reservePlan when the committed intent no longer matches',async()=>{
    const provider=new MutableDemoProvider();const plan=await reserved(provider);
    const forged:Plan={...plan,status:'approved',reservation:undefined,approval:{version:plan.version,providerRevision:provider.revision,approvedAt:new Date().toISOString()},selections:{...plan.selections,movieId:'laugh-track',showtimeId:'lt-2026-09-04-1715'}};
    const result=await reservePlan(forged,forged.version,provider);
    expect(result.ok).toBe(false);
  });
});

describe('reservation ownership and integrity',()=>{
  it('accepts a genuine reservation',async()=>{
    const provider=new MutableDemoProvider();const plan=await reserved(provider);
    expect(reservationOwnership(plan,provider).ok).toBe(true);
    expect(evaluatePlan(plan,provider).checks.find(item=>item.id==='reservation_integrity')?.passed).toBe(true);
  });
  const forgeries:Array<[string,(plan:Plan,provider:MutableDemoProvider)=>Plan]>=[
    ['a completely forged reservation record',plan=>({...plan,reservation:{id:'FAKE-1',planId:plan.id,version:plan.version,providerRevision:0,status:'confirmed',reservedAt:new Date().toISOString(),idempotencyKey:'fake',fingerprint:'fp1_fake',inventory:[]}})],
    ['a reservation for a different plan version',plan=>({...plan,reservation:{...plan.reservation!,version:plan.version-1}})],
    ['a reservation for a different plan id',plan=>({...plan,reservation:{...plan.reservation!,planId:'someone-elses-plan'}})],
    ['committed inventory for another restaurant',plan=>({...plan,reservation:{...plan.reservation!,inventory:plan.reservation!.inventory.map(item=>item.kind==='restaurant'?{...item,inventoryKey:'jade-lantern|2026-09-04|20:00'}:item)}})],
    ['committed inventory for another showtime',plan=>({...plan,reservation:{...plan.reservation!,inventory:plan.reservation!.inventory.map(item=>item.kind==='showtime'?{...item,inventoryKey:'lt-2026-09-04-1715'}:item)}})],
    ['fewer committed seats than people',plan=>({...plan,people:plan.people+1})],
    ['a changed date after confirmation',plan=>({...plan,date:'2026-09-05'})],
  ];
  it.each(forgeries)('reports an integrity failure for %s',async(_name,forge)=>{
    const provider=new MutableDemoProvider();const plan=await reserved(provider);
    const forged=forge(plan,provider);
    const ownership=reservationOwnership(forged,provider);
    expect(ownership.ok).toBe(false);
    expect(ownership.failures.length).toBeGreaterThan(0);
    expect(evaluatePlan(forged,provider).valid).toBe(false);
  });
  it('rejects a reservation replayed from another workspace state',async()=>{
    const provider=new MutableDemoProvider();const plan=await reserved(provider);
    const stolen:ProviderState={...provider.exportState(),reservations:{}};
    const empty=new MutableDemoProvider();empty.importState(stolen);
    expect(reservationOwnership(plan,empty).ok).toBe(false);
  });
});

describe('lifecycle continuity across start_new_plan', ()=>{
  it('keeps the old reservation traceable and gives the new plan independent state',async()=>{
    const provider=new MutableDemoProvider();const plan=await reserved(provider);
    const previous=plan.reservation as Reservation;
    const started=startNewPlan(plan,plan.version,provider);
    expect(started.ok).toBe(true);
    if(!started.ok)return;
    expect(started.data.plan.version).toBeGreaterThan(plan.version);
    expect(started.data.plan.reservation).toBeUndefined();
    expect(provider.listReservations().map(item=>item.id)).toContain(previous.id);
    expect(reservationOwnership(started.data.plan,provider).ok).toBe(true);
    const replay=provider.reserve({...started.data.plan,selections:plan.selections});
    expect(replay.ok===true&&replay.data.idempotent).toBe(false);
  });
});

describe('demo data invariants',()=>{
  it('brackets the planning price with the displayed range for every restaurant',()=>{
    for(const restaurant of restaurants){
      expect(restaurant.priceRangeMin,restaurant.id).toBeLessThanOrEqual(restaurant.pricePerPerson);
      expect(restaurant.priceRangeMax,restaurant.id).toBeGreaterThanOrEqual(restaurant.pricePerPerson);
      expect(restaurant.openingHours,restaurant.id).toContain(restaurant.opensAt);
    }
  });
  it('publishes only table slots inside the operating window',()=>{
    const toMinutes=(value:string)=>Number(value.slice(0,2))*60+Number(value.slice(3));
    for(const restaurant of restaurants)
      for(const slot of restaurant.slots)
        expect(toMinutes(slot.time),`${restaurant.id} ${slot.time}`).toBeGreaterThanOrEqual(toMinutes(restaurant.opensAt));
  });
});
