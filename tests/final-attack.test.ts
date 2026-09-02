import { describe, it, expect } from 'vitest';
import { approvePlan, evaluatePlan, reservePlan, solvePlan, startNewPlan } from '../src/domain';
import { defaultPreferences, initialPlan } from '../src/data';
import { MutableDemoProvider } from '../src/providers';
import { buildTools, resultErrorCode, toolNames } from '../src/tools';
import { parseState, STORAGE_KEY } from '../src/persistence';
import { Plan } from '../src/types';
const c=(d='2026-09-04')=>({city:'Dhaka' as const,date:d,people:3,budget:5000,preferences:defaultPreferences(),dinnerDurationMinutes:75,bufferMinutes:15});
describe('final adversarial pass',()=>{
 it('malformed and hostile stored state is discarded',()=>{
  for(const raw of ['null','{}','[]','{"plan":{"version":-1}}','{"plan":{"id":"x","version":1,"status":"reserved"}}','not json',JSON.stringify({plan:{...initialPlan(),version:0}}),JSON.stringify({plan:{...initialPlan(),budget:99999999}})])
   expect(parseState(raw),raw.slice(0,30)).toBeNull();
  expect(STORAGE_KEY.startsWith('planonit.')).toBe(true);
 });
 it('agent cannot approve, cannot skip approval, cannot forge revision',async()=>{
  const pr=new MutableDemoProvider();const s=solvePlan(c(),0,undefined,pr);if(!s.ok)throw new Error('x');
  let plan=s.plan;const tools=buildTools(()=>plan,p=>{plan=p;},pr);
  expect(toolNames.some(n=>/approve|confirm_human/i.test(n))).toBe(false);
  expect(resultErrorCode(await tools.find(t=>t.name==='reserve_plan')!.execute({expectedVersion:plan.version,confirmation:'CONFIRM_SIMULATED_RESERVATION'}))).toBe('HUMAN_APPROVAL_REQUIRED');
  const forged:Plan={...plan,status:'approved',approval:{version:plan.version,providerRevision:9999,approvedAt:new Date().toISOString()}};
  const r=await reservePlan(forged,forged.version,pr);
  expect(r.ok).toBe(false);
 });
 it('impossible inputs are rejected across every tool',async()=>{
  const pr=new MutableDemoProvider();let plan=initialPlan();const tools=buildTools(()=>plan,p=>{plan=p;},pr);
  const bad=[['create_evening_plan',{...c('2026-02-30')}],['create_evening_plan',{...c(),people:2.5}],['create_evening_plan',{...c(),city:'Chattogram'}],
   ['create_evening_plan',{...c(),budget:-1}],['update_plan',{expectedVersion:1}],['update_plan',{expectedVersion:1,movieId:'x'}],
   ['estimate_transport',{fromLocationId:'bashundhara-city',toLocationId:'dhanmondi-27'}],['find_showtimes',{city:'Dhaka',date:'2026-09-04',people:99}],
   ['get_current_plan',{extra:1}],['reserve_plan',{expectedVersion:1,confirmation:'yes'}]] as const;
  for(const [name,input] of bad) expect(resultErrorCode(await tools.find(t=>t.name===name)!.execute(input)),`${name} ${JSON.stringify(input)}`).toBeTruthy();
  expect(plan.version).toBe(1);
 });
 it('version never rolls backward through any tool sequence',async()=>{
  const pr=new MutableDemoProvider();let plan=initialPlan();const seen:number[]=[];
  const tools=buildTools(()=>plan,p=>{plan=p;seen.push(p.version);},pr);
  await tools.find(t=>t.name==='create_evening_plan')!.execute(c());
  await tools.find(t=>t.name==='update_plan')!.execute({expectedVersion:plan.version,budget:5200});
  await tools.find(t=>t.name==='repair_plan')!.execute({expectedVersion:plan.version});
  const approved=approvePlan(plan,plan.version,pr);if(approved.ok)plan=approved.data.plan;
  await tools.find(t=>t.name==='reserve_plan')!.execute({expectedVersion:plan.version,confirmation:'CONFIRM_SIMULATED_RESERVATION'});
  await tools.find(t=>t.name==='start_new_plan')!.execute({expectedVersion:plan.version});
  expect(seen).toEqual([...seen].sort((a,b)=>a-b));
  expect(new Set(seen).size).toBeGreaterThan(1);
 });
 it('a reserved plan can never be silently replaced or hidden',async()=>{
  const pr=new MutableDemoProvider();const s=solvePlan(c(),0,undefined,pr);if(!s.ok)throw new Error('x');
  const a=approvePlan(s.plan,s.plan.version,pr);if(!a.ok)throw new Error('x');
  const r=await reservePlan(a.data.plan,a.data.plan.version,pr);if(!r.ok)throw new Error('x');
  let plan=r.data.plan;const tools=buildTools(()=>plan,p=>{plan=p;},pr);
  for(const attempt of [['create_evening_plan',c()],['update_plan',{expectedVersion:plan.version,people:4}],['repair_plan',{expectedVersion:plan.version}]] as const)
   expect(resultErrorCode(await tools.find(t=>t.name===attempt[0])!.execute(attempt[1]))).toBeTruthy();
  const started=startNewPlan(plan,plan.version,pr);
  expect(started.ok).toBe(true);
  expect(pr.listReservations()).toHaveLength(1);
  const current=await tools.find(t=>t.name==='get_current_plan')!.execute({}) as {ok:true;data:{reservationLedger:unknown[]}};
  expect(current.data.reservationLedger).toHaveLength(1);
 });
 it('a valid plan stays valid and a broken one stays broken',async()=>{
  const pr=new MutableDemoProvider();const s=solvePlan(c(),0,undefined,pr);if(!s.ok)throw new Error('x');
  expect(evaluatePlan(s.plan,pr).valid).toBe(true);
  pr.setShowtimeSeats(s.plan.selections.showtimeId!,0);
  expect(evaluatePlan(s.plan,pr).valid).toBe(false);
 });
});
