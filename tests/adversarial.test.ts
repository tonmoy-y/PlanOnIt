import { beforeEach, describe, expect, it } from 'vitest';
import { approvePlan, applyPlanUpdate, evaluatePlan, reconcileAbandonedReservation, repairPlan, reservePlan, solvePlan, startNewPlan } from '../src/domain';
import { reservationFingerprint } from '../src/intent';
import { defaultPreferences, initialPlan } from '../src/data';
import { MutableDemoProvider } from '../src/providers';
import { buildTools, resultErrorCode } from '../src/tools';
import { Plan } from '../src/types';
const c={city:'Dhaka' as const,date:'2026-09-04',people:3,budget:5000,preferences:defaultPreferences(),dinnerDurationMinutes:75,bufferMinutes:15};

describe('adversarial: a judge tries to produce inconsistent state',()=>{
 it('forged approval object cannot reserve',async()=>{
  const pr=new MutableDemoProvider();const s=solvePlan(c,0,undefined,pr);if(!s.ok)throw 0;
  const forged:Plan={...s.plan,status:'approved',approval:{version:s.plan.version,providerRevision:999,approvedAt:new Date().toISOString()}};
  const r=await reservePlan(forged,forged.version,pr);
  expect(r.ok).toBe(false);
 });
 it('approval from a different version cannot reserve',async()=>{
  const pr=new MutableDemoProvider();const s=solvePlan(c,0,undefined,pr);if(!s.ok)throw 0;
  const forged:Plan={...s.plan,status:'approved',approval:{version:s.plan.version-1,providerRevision:pr.revision,approvedAt:new Date().toISOString()}};
  const r=await reservePlan(forged,forged.version,pr);
  expect(r.ok).toBe(false);
 });
 it('accounts for a second reservation after start_new_plan instead of double-spending',async()=>{
  const pr=new MutableDemoProvider();const s=solvePlan(c,0,undefined,pr);if(!s.ok)throw new Error('solve failed');
  const a=approvePlan(s.plan,s.plan.version,pr);if(!a.ok)throw new Error('approval failed');
  const r=await reservePlan(a.data.plan,a.data.plan.version,pr);if(!r.ok)throw new Error('reservation failed');
  const key=`${r.data.plan.selections.restaurantId}|${c.date}|${r.data.plan.selections.restaurantSlot}`;
  const afterFirst=pr.exportState().restaurantCapacity[key];
  const n=startNewPlan(r.data.plan,r.data.plan.version,pr);if(!n.ok)throw new Error('lifecycle failed');
  const again=solvePlan(c,n.data.plan.version,{restaurantId:r.data.plan.selections.restaurantId,restaurantSlot:r.data.plan.selections.restaurantSlot,movieId:r.data.plan.selections.movieId,showtimeId:r.data.plan.selections.showtimeId},pr);
  if(!again.ok)return;
  const a2=approvePlan(again.plan,again.plan.version,pr);if(!a2.ok)throw new Error('second approval failed');
  const r2=await reservePlan(a2.data.plan,a2.data.plan.version,pr);
  expect(r2.ok).toBe(true);
  // a genuinely new plan may book the same slot again, but only by consuming more capacity
  expect(pr.exportState().restaurantCapacity[key]).toBe(afterFirst-c.people);
  expect(pr.listReservations()).toHaveLength(2);
  expect(new Set(pr.listReservations().map(item=>item.id)).size).toBe(2);
  // and the first commitment is still on the ledger, not overwritten
  expect(pr.getReservation({id:'current-plan',version:r.data.plan.version})?.status).toBe('confirmed');
 });
 it('a reserved plan cannot be mutated by any tool path',async()=>{
  const pr=new MutableDemoProvider();const s=solvePlan(c,0,undefined,pr);if(!s.ok)throw 0;
  const a=approvePlan(s.plan,s.plan.version,pr);if(!a.ok)throw 0;
  const r=await reservePlan(a.data.plan,a.data.plan.version,pr);if(!r.ok)throw 0;
  let plan=r.data.plan;const tools=buildTools(()=>plan,p=>{plan=p;},pr);
  const codes:Record<string,string|undefined>={};
  codes.update=resultErrorCode(await tools.find(t=>t.name==='update_plan')!.execute({expectedVersion:plan.version,budget:5200}));
  codes.repair=resultErrorCode(await tools.find(t=>t.name==='repair_plan')!.execute({expectedVersion:plan.version}));
  codes.create=resultErrorCode(await tools.find(t=>t.name==='create_evening_plan')!.execute(c));
  expect(plan.version).toBe(r.data.plan.version);
 });
 it('applyPlanUpdate cannot smuggle an approval or reservation field',()=>{
  const pr=new MutableDemoProvider();const s=solvePlan(c,0,undefined,pr);if(!s.ok)throw 0;
  const out=applyPlanUpdate(s.plan,{expectedVersion:s.plan.version,budget:5200,approval:{version:1,providerRevision:0,approvedAt:'x'},status:'reserved'},pr);
  expect(out.ok).toBe(false);
 });
 it('repair cannot resurrect a plan whose inventory vanished',()=>{
  const pr=new MutableDemoProvider();const s=solvePlan(c,0,undefined,pr);if(!s.ok)throw 0;
  for(const r of ['bistro-17','saffron-table','smoke-house','riverstone','pasta-fresco','jade-lantern'])
   for(const t of ['19:00','19:30','19:45','20:00','20:15','20:30','20:45','21:00','21:15','21:30','21:45','22:00','22:30']) pr.setRestaurantCapacity(r,c.date,t,0);
  const rep=repairPlan(s.plan,{expectedVersion:s.plan.version,preserveRestaurant:false,preserveMovie:false},pr);
  expect(rep.ok).toBe(false);
 });
 it('evaluation of a reserved plan whose capacity was zeroed by an attacker',()=>{
  const pr=new MutableDemoProvider();const s=solvePlan(c,0,undefined,pr);if(!s.ok)throw 0;
  const plan={...s.plan,status:'reserved' as const,reservation:{id:'FAKE',planId:s.plan.id,version:s.plan.version,providerRevision:0,status:'confirmed' as const,reservedAt:'x',idempotencyKey:'k',inventory:[]}};
  expect(evaluatePlan(plan,pr).valid).toBe(false);
 });
 it('start_new_plan on a fresh workspace is harmless',()=>{
  const pr=new MutableDemoProvider();
  const out=startNewPlan(initialPlan(),1,pr);
  expect(out.ok).toBe(true);
 });
});

/**
 * Revision 5: attack the abandoned-reservation recovery path itself. Recovery must never be
 * a laundering route into a reserved state, must never move the version, and must leave the
 * reserved/immutable and idempotency guarantees exactly as strong as before.
 */
describe('adversarial: attacking abandoned-reservation recovery',()=>{
  const provider=new MutableDemoProvider();
  const prefs=defaultPreferences();
  const approvedPlan=(date='2026-09-05'):Plan=>{
    const solved=solvePlan({city:'Dhaka',date,people:2,budget:9000,preferences:prefs,dinnerDurationMinutes:75,bufferMinutes:15},0,undefined,provider);
    if(!solved.ok)throw new Error('no plan');
    const approved=approvePlan(solved.plan,solved.plan.version,provider);if(!approved.ok)throw new Error('no approval');
    return approved.data.plan;
  };
  beforeEach(()=>provider.reset());

  it('cannot be used to launder a forged reservation into a reserved state',()=>{
    const plan=approvedPlan();
    const forged:Plan={...plan,status:'reservation_pending',reservation:{id:'SBX-FORGED',planId:plan.id,version:plan.version,providerRevision:99,status:'pending',reservedAt:new Date().toISOString(),idempotencyKey:reservationFingerprint(plan,provider),fingerprint:reservationFingerprint(plan,provider),inventory:[{kind:'restaurant',inventoryKey:'not|real|key',quantity:2,state:'committed'}]}};
    const {plan:recovered,resolved}=reconcileAbandonedReservation(forged,provider);
    expect(resolved).toBe('failed');
    expect(recovered.status).toBe('reservation_failed');
    expect(provider.listReservations()).toHaveLength(0);
  });

  it('never moves the version in either direction',()=>{
    const plan=approvedPlan();
    expect(reconcileAbandonedReservation({...plan,status:'reservation_pending'},provider).plan.version).toBe(plan.version);
  });

  it('leaves a recovered reserved plan immutable, owned, and exposed in the ledger',async()=>{
    const plan=approvedPlan();
    expect(provider.reserve(plan)).toMatchObject({ok:true});
    const {plan:recovered}=reconcileAbandonedReservation({...plan,status:'reservation_pending'},provider);
    expect(recovered.status).toBe('reserved');
    expect(evaluatePlan(recovered,provider).valid).toBe(true);
    expect(applyPlanUpdate(recovered,{expectedVersion:recovered.version,budget:12000},provider)).toMatchObject({ok:false,error:{code:'PLAN_IMMUTABLE'}});
    const tools=buildTools(()=>recovered,()=>undefined,provider);
    expect(resultErrorCode(await tools.find(tool=>tool.name==='create_evening_plan')!.execute({city:'Dhaka',date:'2026-09-05',people:2,budget:9000,preferences:prefs}))).toBe('WORKSPACE_HAS_ACTIVE_RESERVATION');
    expect(startNewPlan(recovered,recovered.version,provider)).toMatchObject({ok:true});
    expect(provider.listReservations()).toHaveLength(1);
  });

  it('cannot double-spend inventory after a released attempt is reserved for real',async()=>{
    const plan=approvedPlan();
    const {plan:released}=reconcileAbandonedReservation({...plan,status:'reservation_pending',reservation:{id:'PENDING',planId:plan.id,version:plan.version,providerRevision:0,status:'pending',reservedAt:new Date().toISOString(),idempotencyKey:'k',fingerprint:'k',inventory:[{kind:'showtime',inventoryKey:plan.selections.showtimeId!,quantity:2,state:'held'}]}},provider);
    const reapproved=approvePlan(released,released.version,provider);
    expect(reapproved).toMatchObject({ok:true});
    if(!reapproved.ok)throw new Error('unreachable');
    const first=await reservePlan(reapproved.data.plan,reapproved.data.plan.version,provider);
    expect(first).toMatchObject({ok:true});
    const seats=provider.getShowtime(plan.selections.showtimeId)!.seatsRemaining;
    expect(await reservePlan(first.ok?first.data.plan:reapproved.data.plan,reapproved.data.plan.version,provider)).toMatchObject({ok:true});
    expect(provider.getShowtime(plan.selections.showtimeId)!.seatsRemaining).toBe(seats);
    expect(provider.listReservations()).toHaveLength(1);
  });
});
