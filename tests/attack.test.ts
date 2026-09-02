import { describe, it, expect } from 'vitest';
import { approvePlan, evaluatePlan, reservePlan, solvePlan, startNewPlan } from '../src/domain';
import { defaultPreferences } from '../src/data';
import { MutableDemoProvider } from '../src/providers';
import { buildTools, resultErrorCode, toolNames } from '../src/tools';
import { reservationFingerprint } from '../src/intent';
import { Plan } from '../src/types';
const c={city:'Dhaka' as const,date:'2026-09-04',people:3,budget:5000,preferences:defaultPreferences(),dinnerDurationMinutes:75,bufferMinutes:15};
const reserved=async(pr:MutableDemoProvider)=>{const s=solvePlan(c,0,undefined,pr);if(!s.ok)throw new Error('solve');const a=approvePlan(s.plan,s.plan.version,pr);if(!a.ok)throw new Error('approve');const r=await reservePlan(a.data.plan,a.data.plan.version,pr);if(!r.ok)throw new Error('reserve');return r.data.plan;};
describe('adversarial: lifecycle, identity and integrity attacks',()=>{
 it('tool count',()=>{console.log('tools:',toolNames.length,toolNames.join(','));expect(toolNames.length).toBe(13);});
 it('fingerprint changes with every intent field',()=>{
  const pr=new MutableDemoProvider();const s=solvePlan(c,0,undefined,pr);if(!s.ok)throw new Error('x');
  const base=reservationFingerprint(s.plan,pr);
  const variants:Record<string,Plan>={
   sameIntent:{...s.plan},
   differentRestaurant:{...s.plan,selections:{...s.plan.selections,restaurantId:'riverstone'}},
   differentSlot:{...s.plan,selections:{...s.plan.selections,restaurantSlot:'20:00'}},
   differentShowtime:{...s.plan,selections:{...s.plan.selections,showtimeId:'pm-2026-09-04-1730'}},
   differentDate:{...s.plan,date:'2026-09-05'},
   differentPeople:{...s.plan,people:4},
   differentVersion:{...s.plan,version:s.plan.version+1},
  };
  for(const [name,plan] of Object.entries(variants)){
   const fp=reservationFingerprint(plan,pr);
   const same=fp===base;
   if(name==='sameIntent')expect(same).toBe(true); else expect(same).toBe(false);
  }
 });
 it('forged reservation pointing at other inventory is rejected',async()=>{
  const pr=new MutableDemoProvider();const plan=await reserved(pr);
  const forged:Plan={...plan,selections:{...plan.selections,restaurantId:'riverstone',restaurantSlot:'20:00'}};
  const ev=evaluatePlan(forged,pr);
  expect(ev.valid).toBe(false);
 });
 it('replayed reservation record from another plan is rejected',async()=>{
  const pr=new MutableDemoProvider();const plan=await reserved(pr);
  const stolen:Plan={...plan,id:'other-plan',version:99};
  expect(evaluatePlan(stolen,pr).valid).toBe(false);
 });
 it('every mutation path is blocked while reserved and while pending',async()=>{
  const pr=new MutableDemoProvider();const base=await reserved(pr);
  for(const status of ['reserved','reservation_pending'] as const){
   let plan:Plan={...base,status};const tools=buildTools(()=>plan,p=>{plan=p;},pr);
   const codes={update:resultErrorCode(await tools.find(t=>t.name==='update_plan')!.execute({expectedVersion:plan.version,budget:5200})),
    repair:resultErrorCode(await tools.find(t=>t.name==='repair_plan')!.execute({expectedVersion:plan.version})),
    create:resultErrorCode(await tools.find(t=>t.name==='create_evening_plan')!.execute(c))};
   expect(Object.values(codes).every(Boolean)).toBe(true);
   expect(plan.version).toBe(base.version);
  }
 });
 it('start_new_plan cannot inherit the old reservation',async()=>{
  const pr=new MutableDemoProvider();const plan=await reserved(pr);
  const n=startNewPlan(plan,plan.version,pr);if(!n.ok)throw new Error('x');
  expect(n.data.plan.reservation).toBeUndefined();
  expect(n.data.plan.version).toBeGreaterThan(plan.version);
  expect(pr.listReservations()).toHaveLength(1);
 });
 it('approval cannot be supplied by any tool',()=>{
  expect(toolNames.some(n=>/approve/i.test(n))).toBe(false);
 });
});
