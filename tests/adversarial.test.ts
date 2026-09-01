import { describe, expect, it } from 'vitest';
import { approvePlan, applyPlanUpdate, evaluatePlan, repairPlan, reservePlan, solvePlan, startNewPlan } from '../src/domain';
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
   for(const t of ['17:30','17:45','18:00','18:15','18:30','18:45','19:00']) pr.setRestaurantCapacity(r,c.date,t,0);
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
