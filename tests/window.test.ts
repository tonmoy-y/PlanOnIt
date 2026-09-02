import { afterEach, describe, expect, it } from 'vitest';
import { addCalendarDays, PLANNING_WINDOW_DAYS, planningWindow, planningWindowDates, parseInput, planningDateSchema, setPlanningWindowOrigin } from '../src/validation';
import { initialPlan, defaultPreferences } from '../src/data';
import { MutableDemoProvider } from '../src/providers';
import { approvePlan, evaluatePlan, repairPlan, reservePlan, solvePlan, startNewPlan } from '../src/domain';
import { buildTools } from '../src/tools';
import { Plan } from '../src/types';

const TEST_ORIGIN='2026-09-01';
afterEach(()=>setPlanningWindowOrigin(TEST_ORIGIN));

describe('rolling inventory window',()=>{
  it('pins to the documented demo window under the test origin',()=>{
    expect(planningWindow()).toEqual({start:'2026-09-03',end:'2026-09-16'});
    expect(planningWindowDates()).toHaveLength(PLANNING_WINDOW_DAYS);
  });

  it.each(['2027-03-14','2030-12-30','2026-02-27'])('always offers a usable window from origin %s',origin=>{
    setPlanningWindowOrigin(origin);
    const {start,end}=planningWindow();
    expect(start).toBe(addCalendarDays(origin,2));
    expect(end).toBe(addCalendarDays(start,PLANNING_WINDOW_DAYS-1));
    expect(start>origin).toBe(true);
    expect(parseInput(planningDateSchema,start).ok).toBe(true);
    expect(parseInput(planningDateSchema,end).ok).toBe(true);
    expect(parseInput(planningDateSchema,addCalendarDays(start,-1)).ok).toBe(false);
    expect(parseInput(planningDateSchema,addCalendarDays(end,1)).ok).toBe(false);
  });

  it('handles month and year boundaries without producing impossible dates',()=>{
    setPlanningWindowOrigin('2026-12-28');
    expect(planningWindow()).toEqual({start:'2026-12-30',end:'2027-01-12'});
    setPlanningWindowOrigin('2028-02-27');
    expect(planningWindow().start).toBe('2028-02-29'); // leap year
    for(const date of planningWindowDates())expect(parseInput(planningDateSchema,date).ok).toBe(true);
  });

  it('starts every new workspace inside its own window',()=>{
    for(const origin of ['2026-09-01','2027-07-04','2031-01-01']){
      setPlanningWindowOrigin(origin);
      const plan=initialPlan();
      const {start,end}=planningWindow();
      expect(plan.date>=start&&plan.date<=end).toBe(true);
      expect(parseInput(planningDateSchema,plan.date).ok).toBe(true);
    }
  });

  it('projects real inventory onto a future window so the demo cannot expire',()=>{
    setPlanningWindowOrigin('2029-05-10');
    const provider=new MutableDemoProvider();
    const {start,end}=planningWindow();
    for(const date of [start,end]){
      const result=solvePlan({city:'Dhaka',date,people:3,budget:5000,preferences:defaultPreferences(),dinnerDurationMinutes:75,bufferMinutes:15},0,undefined,provider);
      expect(result.ok,`no feasible plan on ${date}`).toBe(true);
      if(!result.ok)return;
      expect(result.plan.date).toBe(date);
      expect(result.plan.selections.showtimeId).toContain(date);
      expect(result.evaluation.valid).toBe(true);
    }
    expect(provider.showtimesForDate(addCalendarDays(end,1))).toEqual([]);
    expect(provider.showtimesForDate(addCalendarDays(start,-1))).toEqual([]);
  });

  it('advertises the current window in the WebMCP schema rather than fixed dates',()=>{
    setPlanningWindowOrigin('2028-10-01');
    let plan:Plan=initialPlan();
    const tools=buildTools(()=>plan,next=>{plan=next;},new MutableDemoProvider());
    const dates=planningWindowDates();
    for(const name of ['search_restaurants','find_showtimes','check_restaurant_availability','create_evening_plan']){
      const schema=tools.find(tool=>tool.name===name)!.inputSchema as {properties:{date:{enum:string[];description:string}}};
      expect(schema.properties.date.enum,name).toEqual(dates);
      expect(schema.properties.date.description).toContain(dates[0]);
    }
  });

  it('rejects a date outside the rolled window through a live tool call',async()=>{
    setPlanningWindowOrigin('2028-10-01');
    let plan:Plan=initialPlan();
    const tools=buildTools(()=>plan,next=>{plan=next;},new MutableDemoProvider());
    const stale=await tools.find(tool=>tool.name==='search_restaurants')!.execute({city:'Dhaka',date:'2026-09-04',people:2}) as {ok:false;error:{code:string;message:string}};
    expect(stale.ok).toBe(false);
    expect(stale.error.code).toBe('INVALID_INPUT');
    expect(stale.error.message).toContain(planningWindow().start);
  });
});

describe('an evening that has passed',()=>{
  const constraints=(date:string)=>({city:'Dhaka' as const,date,people:3,budget:5000,preferences:defaultPreferences(),dinnerDurationMinutes:75,bufferMinutes:15});
  const reservedOn=async(provider:MutableDemoProvider,date:string)=>{
    const solved=solvePlan(constraints(date),0,undefined,provider);if(!solved.ok)throw new Error('solve failed');
    const approved=approvePlan(solved.plan,solved.plan.version,provider);if(!approved.ok)throw new Error('approval failed');
    const reserved=await reservePlan(approved.data.plan,approved.data.plan.version,provider);if(!reserved.ok)throw new Error('reservation failed');
    return reserved.data.plan;
  };

  it('never accuses a genuine past reservation of an integrity failure',async()=>{
    const provider=new MutableDemoProvider();
    const plan=await reservedOn(provider,'2026-09-04');
    expect(evaluatePlan(plan,provider).valid).toBe(true);
    setPlanningWindowOrigin('2026-10-01');
    const evaluation=evaluatePlan(plan,provider);
    const ownership=evaluation.checks.find(item=>item.id==='reservation_integrity')!;
    expect(ownership.passed,'a real reservation must not read as forged once its date passes').toBe(true);
    expect(ownership.message).toContain('stays committed in the ledger');
    expect(provider.listReservations()).toHaveLength(1);
    // it is still not a currently-valid plan, and the leading reason says why in plain language
    expect(evaluation.valid).toBe(false);
    const expiry=evaluation.checks.find(item=>item.id==='date_window')!;
    expect(expiry.passed).toBe(false);
    expect(expiry.message).toContain('This evening has passed');
    expect(evaluation.checks.filter(item=>!item.passed)[0].id).toBe('date_window');
  });

  it('still reports a forged past reservation as an integrity failure',async()=>{
    const provider=new MutableDemoProvider();
    const plan=await reservedOn(provider,'2026-09-04');
    setPlanningWindowOrigin('2026-10-01');
    const forged={...plan,reservation:{...plan.reservation!,id:'SBX-FAKE',fingerprint:'fp1_forged'}};
    const ownership=evaluatePlan(forged,provider).checks.find(item=>item.id==='reservation_integrity')!;
    expect(ownership.passed).toBe(false);
    expect(ownership.message).toContain('no matching provider commitment');
  });

  it('starts the next plan on a currently supported date, not the stale one',async()=>{
    const provider=new MutableDemoProvider();
    const plan=await reservedOn(provider,'2026-09-04');
    setPlanningWindowOrigin('2026-10-01');
    const started=startNewPlan(plan,plan.version,provider);
    expect(started.ok).toBe(true);
    if(!started.ok)return;
    const {start,end}=planningWindow();
    expect(started.data.plan.date>=start&&started.data.plan.date<=end,`${started.data.plan.date} must be inside ${start}..${end}`).toBe(true);
    expect(parseInput(planningDateSchema,started.data.plan.date).ok).toBe(true);
    expect(started.data.archivedReservation?.id).toBe(plan.reservation?.id);
    // and the fresh plan can immediately be solved on its own date
    const solved=solvePlan(constraints(started.data.plan.date),started.data.plan.version,undefined,provider);
    expect(solved.ok).toBe(true);
  });

  it('refuses to repair a plan whose evening has passed instead of inventing one',()=>{
    const provider=new MutableDemoProvider();
    const solved=solvePlan(constraints('2026-09-04'),0,undefined,provider);
    if(!solved.ok)throw new Error('solve failed');
    setPlanningWindowOrigin('2026-10-01');
    const repaired=repairPlan(solved.plan,{expectedVersion:solved.plan.version,preserveRestaurant:true,preserveMovie:false},provider);
    expect(repaired.ok).toBe(false);
    if(!repaired.ok)expect(repaired.error.code).toBe('NO_RESTAURANT_AVAILABILITY');
  });
});
