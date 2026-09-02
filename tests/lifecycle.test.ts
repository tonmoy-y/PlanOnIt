import { beforeEach, describe, expect, it } from 'vitest';
import { applyPlanUpdate, approvePlan, evaluatePlan, hasActiveReservation, reconcileAbandonedReservation, repairPlan, reservePlan, solvePlan, startNewPlan } from '../src/domain';
import { reservationFingerprint } from '../src/intent';
import { defaultPreferences, initialPlan } from '../src/data';
import { demoProvider, MutableDemoProvider } from '../src/providers';
import { buildTools, resultErrorCode, toolNames } from '../src/tools';
import { Plan } from '../src/types';

const constraints={city:'Dhaka' as const,date:'2026-09-04',people:3,budget:5000,preferences:defaultPreferences(),dinnerDurationMinutes:75,bufferMinutes:15};
function harness(provider=demoProvider){let plan:Plan=initialPlan();const changes:string[]=[];const tools=buildTools(()=>plan,(next,activity)=>{plan=next;changes.push(activity)},provider);return{tools,get plan(){return plan},set plan(value:Plan){plan=value},changes,call:(name:string,input:unknown)=>tools.find(tool=>tool.name===name)!.execute(input)};}
async function reservedHarness(provider:MutableDemoProvider){
  const h=harness(provider);
  await h.call('create_evening_plan',constraints);
  const approved=approvePlan(h.plan,h.plan.version,provider);if(!approved.ok)throw new Error('approval failed');
  h.plan=approved.data.plan;
  const reserved=await h.call('reserve_plan',{expectedVersion:h.plan.version,confirmation:'CONFIRM_SIMULATED_RESERVATION'});
  expect(reserved).toMatchObject({ok:true});
  return h;
}
beforeEach(()=>demoProvider.reset());

describe('reserved workspace lifecycle',()=>{
  it('refuses to replace an actively reserved plan and keeps the reservation exposed',async()=>{
    const provider=new MutableDemoProvider();const h=await reservedHarness(provider);
    const reservedVersion=h.plan.version;const reservationId=h.plan.reservation!.id;
    const blocked=await h.call('create_evening_plan',constraints) as {ok:false;error:{code:string;message:string;details?:string[];context?:unknown}};
    expect(blocked.ok).toBe(false);
    expect(blocked.error.code).toBe('WORKSPACE_HAS_ACTIVE_RESERVATION');
    expect(blocked.error.message).toContain('start_new_plan');
    expect(blocked.error.context).toEqual({planVersion:reservedVersion,providerRevision:provider.revision});
    expect(h.plan.version).toBe(reservedVersion);
    expect(h.plan.status).toBe('reserved');
    expect(h.plan.reservation?.id).toBe(reservationId);
    const current=await h.call('get_current_plan',{}) as {ok:true;data:{activeReservation?:{id:string};plan:{plan:Plan};evaluation?:unknown;reservationLedger:Array<{id:string;belongsToCurrentPlan:boolean}>}};
    expect(current.data.activeReservation?.id).toBe(reservationId);
    expect(current.data.reservationLedger.find(item=>item.id===reservationId)?.belongsToCurrentPlan).toBe(true);
  });
  it('blocks update and repair on a reserved plan for consistency with create',async()=>{
    const provider=new MutableDemoProvider();const h=await reservedHarness(provider);
    expect(resultErrorCode(await h.call('update_plan',{expectedVersion:h.plan.version,budget:5200}))).toBe('PLAN_IMMUTABLE');
    expect(resultErrorCode(await h.call('repair_plan',{expectedVersion:h.plan.version}))).toBe('PLAN_ALREADY_RESERVED');
    expect(resultErrorCode(await h.call('create_evening_plan',constraints))).toBe('WORKSPACE_HAS_ACTIVE_RESERVATION');
  });
  it('keeps committed inventory owned by the reserved version while it is protected',async()=>{
    const provider=new MutableDemoProvider();const h=await reservedHarness(provider);
    const before=provider.exportState();
    await h.call('create_evening_plan',constraints);
    expect(provider.exportState()).toEqual(before);
    expect(Object.keys(provider.exportState().reservations)).toEqual([`current-plan:v${h.plan.version}`]);
  });
  it('starts a new plan that preserves and still exposes the previous reservation',async()=>{
    const provider=new MutableDemoProvider();const h=await reservedHarness(provider);
    const oldVersion=h.plan.version;const reservationId=h.plan.reservation!.id;
    const started=await h.call('start_new_plan',{expectedVersion:oldVersion}) as {ok:true;data:{archivedReservation:{id:string};reservationLedger:Array<{id:string}>;plan:{plan:Plan}}};
    expect(started.ok).toBe(true);
    expect(started.data.archivedReservation.id).toBe(reservationId);
    expect(started.data.reservationLedger.map(item=>item.id)).toContain(reservationId);
    expect(h.plan.version).toBe(oldVersion+1);
    expect(h.plan.status).toBe('draft');
    expect(h.plan.reservation).toBeUndefined();
    expect(h.plan.selections).toEqual({});
    expect(h.plan.changeSummary).toContain(reservationId);
    expect(provider.getReservation({id:'current-plan',version:oldVersion})?.status).toBe('confirmed');
    const ledger=(await h.call('get_current_plan',{}) as {ok:true;data:{activeReservation?:unknown;reservationLedger:Array<{id:string;supersededByNewerPlan:boolean}>}}).data;
    expect(ledger.activeReservation).toBeUndefined();
    expect(ledger.reservationLedger.find(item=>item.id===reservationId)?.supersededByNewerPlan).toBe(true);
  });
  it('allows planning again only after the explicit lifecycle call',async()=>{
    const provider=new MutableDemoProvider();const h=await reservedHarness(provider);
    expect(resultErrorCode(await h.call('create_evening_plan',constraints))).toBe('WORKSPACE_HAS_ACTIVE_RESERVATION');
    await h.call('start_new_plan',{expectedVersion:h.plan.version});
    expect(await h.call('create_evening_plan',constraints)).toMatchObject({ok:true});
    expect(h.plan.status).toBe('valid');
  });
  it('rejects stale versions on the lifecycle call and cannot bypass protection',async()=>{
    const provider=new MutableDemoProvider();const h=await reservedHarness(provider);
    expect(resultErrorCode(await h.call('start_new_plan',{expectedVersion:h.plan.version-1}))).toBe('STALE_PLAN_VERSION');
    expect(resultErrorCode(await h.call('start_new_plan',{expectedVersion:h.plan.version+5}))).toBe('STALE_PLAN_VERSION');
    expect(h.plan.status).toBe('reserved');
  });
  it('is safe when the lifecycle call is repeated',async()=>{
    const provider=new MutableDemoProvider();const h=await reservedHarness(provider);
    const first=await h.call('start_new_plan',{expectedVersion:h.plan.version}) as {ok:true;data:{archivedReservation?:unknown}};
    expect(first.data.archivedReservation).toBeDefined();
    const second=await h.call('start_new_plan',{expectedVersion:h.plan.version}) as {ok:true;data:{archivedReservation?:unknown}};
    expect(second.ok).toBe(true);
    expect(second.data.archivedReservation).toBeUndefined();
    expect(provider.listReservations()).toHaveLength(1);
    expect(provider.exportState().revision).toBe(1);
  });
  it('works on the human domain path as well as the WebMCP path',async()=>{
    const provider=new MutableDemoProvider();
    const solved=solvePlan(constraints,0,undefined,provider);if(!solved.ok)throw new Error('solve failed');
    const approved=approvePlan(solved.plan,solved.plan.version,provider);if(!approved.ok)throw new Error('approval failed');
    const reserved=await reservePlan(approved.data.plan,approved.data.plan.version,provider);if(!reserved.ok)throw new Error('reservation failed');
    expect(hasActiveReservation(reserved.data.plan)).toBe(true);
    const started=startNewPlan(reserved.data.plan,reserved.data.plan.version,provider);
    expect(started.ok).toBe(true);
    if(!started.ok)return;
    expect(started.data.archivedReservation?.id).toBe(reserved.data.reservationId);
    expect(hasActiveReservation(started.data.plan)).toBe(false);
    expect(started.data.plan.people).toBe(solved.plan.people);
    expect(started.data.plan.preferences).toEqual(solved.plan.preferences);
    expect(provider.listReservations()).toHaveLength(1);
  });
});

describe('observable reservation pending state',()=>{
  it('commits reservation_pending before provider inventory changes',async()=>{
    const provider=new MutableDemoProvider();const h=harness(provider);
    await h.call('create_evening_plan',constraints);
    const approved=approvePlan(h.plan,h.plan.version,provider);if(!approved.ok)throw new Error('approval failed');
    h.plan=approved.data.plan;
    const revisionBeforeAttempt=provider.revision;
    const seen:Array<{status:string;revision:number}>=[];
    const observing=buildTools(()=>h.plan,next=>{h.plan=next;seen.push({status:next.status,revision:provider.revision})},provider);
    await observing.find(tool=>tool.name==='reserve_plan')!.execute({expectedVersion:h.plan.version,confirmation:'CONFIRM_SIMULATED_RESERVATION'});
    expect(seen.map(item=>item.status)).toEqual(['reservation_pending','reserved']);
    expect(seen[0].revision).toBe(revisionBeforeAttempt);
    expect(seen[1].revision).toBe(revisionBeforeAttempt+1);
  });
  it('records pending then failed without consuming inventory',async()=>{
    const provider=new MutableDemoProvider();const h=harness(provider);
    await h.call('create_evening_plan',constraints);
    const approved=approvePlan(h.plan,h.plan.version,provider);if(!approved.ok)throw new Error('approval failed');
    h.plan=approved.data.plan;provider.simulateNextReservationFailure();
    const statuses:string[]=[];
    const observing=buildTools(()=>h.plan,next=>{h.plan=next;statuses.push(next.status)},provider);
    const result=await observing.find(tool=>tool.name==='reserve_plan')!.execute({expectedVersion:h.plan.version,confirmation:'CONFIRM_SIMULATED_RESERVATION'});
    expect(resultErrorCode(result)).toBe('PROVIDER_UNAVAILABLE');
    expect(statuses).toEqual(['reservation_pending','reservation_failed']);
    expect(provider.revision).toBe(0);
    expect(provider.listReservations()).toHaveLength(0);
  });
  it('keeps a pending plan immutable and out of the lifecycle call',()=>{
    const pending={...initialPlan(),status:'reservation_pending' as const};
    const result=startNewPlan(pending,pending.version);
    expect(result.ok).toBe(false);
    if(!result.ok)expect(result.error.code).toBe('RESERVATION_IN_PROGRESS');
  });
});

describe('advertised schema matches runtime for every tool',()=>{
  it('registers thirteen tools with strict object schemas and disclosed side effects',()=>{
    const h=harness();
    expect(h.tools.map(tool=>tool.name)).toEqual(toolNames);
    expect(h.tools).toHaveLength(13);
    for(const tool of h.tools){
      const schema=tool.inputSchema as {type:string;additionalProperties:boolean;required:string[];properties:Record<string,unknown>};
      expect(schema.type).toBe('object');
      expect(schema.additionalProperties).toBe(false);
      expect(Object.keys(schema.properties)).toEqual(expect.arrayContaining(schema.required));
      expect(tool.description.length).toBeGreaterThan(70);
    }
  });
  it('expresses update_plan cross-field rules in the advertised schema',()=>{
    const schema=harness().tools.find(tool=>tool.name==='update_plan')!.inputSchema as {minProperties:number;dependentRequired:Record<string,string[]>};
    expect(schema.minProperties).toBe(2);
    expect(schema.dependentRequired).toEqual({restaurantId:['restaurantSlot'],restaurantSlot:['restaurantId'],movieId:['showtimeId'],showtimeId:['movieId']});
  });
  it('rejects at runtime exactly what the advertised schema forbids',async()=>{
    const h=harness();
    await h.call('create_evening_plan',constraints);
    const version=h.plan.version;
    expect(resultErrorCode(await h.call('update_plan',{expectedVersion:version}))).toBe('INVALID_INPUT');
    expect(resultErrorCode(await h.call('update_plan',{expectedVersion:version,movieId:'paper-moons'}))).toBe('INVALID_INPUT');
    expect(resultErrorCode(await h.call('update_plan',{expectedVersion:version,showtimeId:'pm-2026-09-04-2000'}))).toBe('INVALID_INPUT');
    expect(resultErrorCode(await h.call('update_plan',{expectedVersion:version,restaurantId:'bistro-17'}))).toBe('INVALID_INPUT');
    expect(resultErrorCode(await h.call('update_plan',{expectedVersion:version,restaurantSlot:'18:00'}))).toBe('INVALID_INPUT');
  });
  it('returns a contextual, actionable error for every rejected combination',async()=>{
    const h=harness();
    const result=await h.call('update_plan',{expectedVersion:1,movieId:'paper-moons'}) as {ok:false;error:{field?:string;details?:string[];context?:unknown;retryable:boolean}};
    expect(result.error.field).toBe('movieId');
    expect(result.error.retryable).toBe(true);
    expect(result.error.details?.join(' ')).toContain('must be updated together');
    expect(result.error.context).toEqual({planVersion:1,providerRevision:0});
  });
  it('gives start_new_plan a strict schema and a documented side effect',()=>{
    const tool=harness().tools.find(item=>item.name==='start_new_plan')!;
    expect(tool.annotations.readOnlyHint).toBe(false);
    expect(tool.description).toContain('never cancelled');
    expect((tool.inputSchema as {required:string[]}).required).toEqual(['expectedVersion']);
  });
});

/**
 * BUG-3 — a `reservation_pending` plan persisted by a tab that died mid-commit is correctly
 * immutable, which used to make it a permanent dead end: update, repair, approve, reserve,
 * and start_new_plan all refuse it and only a destructive reset escaped. Recovery must
 * resolve it honestly without consuming inventory or losing a real commitment.
 */
describe('BUG-3 — an abandoned in-flight reservation is recoverable', () => {
  const pendingPlan=(plan:Plan,provider:MutableDemoProvider):Plan=>({...plan,status:'reservation_pending',reservation:{id:`PENDING-${plan.id.toUpperCase()}-V${plan.version}`,planId:plan.id,version:plan.version,providerRevision:provider.revision,status:'pending',reservedAt:new Date().toISOString(),idempotencyKey:reservationFingerprint(plan,provider),fingerprint:reservationFingerprint(plan,provider),inventory:[{kind:'restaurant',inventoryKey:`${plan.selections.restaurantId}|${plan.date}|${plan.selections.restaurantSlot}`,quantity:plan.people,state:'held'}]}});

  async function approvedPlan(provider:MutableDemoProvider){
    const solved=solvePlan(constraints,0,undefined,provider);if(!solved.ok)throw new Error('no plan');
    const approved=approvePlan(solved.plan,solved.plan.version,provider);if(!approved.ok)throw new Error('no approval');
    return approved.data.plan;
  }

  it('reproduces the dead end: every path refuses a persisted pending plan', async () => {
    const provider=new MutableDemoProvider();
    const stuck=pendingPlan(await approvedPlan(provider),provider);
    expect(startNewPlan(stuck,stuck.version,provider)).toMatchObject({ok:false,error:{code:'RESERVATION_IN_PROGRESS'}});
    expect(applyPlanUpdate(stuck,{expectedVersion:stuck.version,budget:12000},provider)).toMatchObject({ok:false,error:{code:'RESERVATION_IN_PROGRESS'}});
    expect(repairPlan(stuck,{expectedVersion:stuck.version,preserveRestaurant:true,preserveMovie:false},provider)).toMatchObject({ok:false,error:{code:'RESERVATION_IN_PROGRESS'}});
    expect(approvePlan(stuck,stuck.version,provider)).toMatchObject({ok:false,error:{code:'RESERVATION_IN_PROGRESS'}});
    expect(await reservePlan(stuck,stuck.version,provider,undefined,undefined,()=>stuck)).toMatchObject({ok:false,error:{code:'RESERVATION_IN_PROGRESS'}});
  });

  it('releases an abandoned attempt that never reached the provider, without consuming inventory', async () => {
    const provider=new MutableDemoProvider();
    const stuck=pendingPlan(await approvedPlan(provider),provider);
    const revisionBefore=provider.revision;
    const {plan:recovered,resolved}=reconcileAbandonedReservation(stuck,provider);
    expect(resolved).toBe('failed');
    expect(recovered.status).toBe('reservation_failed');
    expect(recovered.version).toBe(stuck.version);
    expect(recovered.approval).toBeUndefined();
    expect(recovered.reservation?.failureCode).toBe('RESERVATION_ABANDONED');
    expect(recovered.reservation?.inventory.every(item=>item.state==='released')).toBe(true);
    expect(provider.revision).toBe(revisionBefore);
    expect(provider.listReservations()).toHaveLength(0);
    // The workspace is usable again: approving and reserving still works from here.
    const reapproved=approvePlan(recovered,recovered.version,provider);
    expect(reapproved).toMatchObject({ok:true});
    if(!reapproved.ok)throw new Error('unreachable');
    expect(await reservePlan(reapproved.data.plan,reapproved.data.plan.version,provider)).toMatchObject({ok:true});
  });

  it('promotes to reserved when the ledger really did commit the same intent', async () => {
    const provider=new MutableDemoProvider();
    const plan=await approvedPlan(provider);
    const committed=provider.reserve(plan);
    expect(committed).toMatchObject({ok:true});
    // The commit landed but the tab died before writing the plan back.
    const stuck=pendingPlan(plan,provider);
    const {plan:recovered,resolved}=reconcileAbandonedReservation(stuck,provider);
    expect(resolved).toBe('reserved');
    expect(recovered.status).toBe('reserved');
    expect(recovered.version).toBe(plan.version);
    expect(recovered.reservation?.status).toBe('confirmed');
    expect(hasActiveReservation(recovered)).toBe(true);
    // Recovery must survive the ownership check, not merely set a label.
    expect(evaluatePlan(recovered,provider).checks.find(item=>item.id==='reservation_integrity')?.passed).toBe(true);
    expect(provider.listReservations()).toHaveLength(1);
  });

  it('refuses to adopt a ledger entry committed for a different intent', async () => {
    const provider=new MutableDemoProvider();
    const plan=await approvedPlan(provider);
    expect(provider.reserve(plan)).toMatchObject({ok:true});
    // Same plan id and version, different party size: the ledger entry is not this intent.
    const forged=pendingPlan({...plan,people:plan.people+1},provider);
    const {plan:recovered,resolved}=reconcileAbandonedReservation(forged,provider);
    expect(resolved).toBe('failed');
    expect(recovered.status).toBe('reservation_failed');
  });

  it('leaves every other status untouched', async () => {
    const provider=new MutableDemoProvider();
    const plan=await approvedPlan(provider);
    for(const status of ['draft','valid','approved','reservation_failed','reserved'] as const){
      const candidate={...plan,status};
      expect(reconcileAbandonedReservation(candidate,provider)).toEqual({plan:candidate,resolved:'none'});
    }
  });

  it('is idempotent when repeated', async () => {
    const provider=new MutableDemoProvider();
    const stuck=pendingPlan(await approvedPlan(provider),provider);
    const first=reconcileAbandonedReservation(stuck,provider);
    const second=reconcileAbandonedReservation(first.plan,provider);
    expect(second.resolved).toBe('none');
    expect(second.plan).toEqual(first.plan);
  });
});
