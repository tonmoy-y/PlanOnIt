import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ArrowRight, Bot, CalendarDays, Check, CheckCircle2, CircleDollarSign, Clock3, Copy, History, Lock, MapPin, Navigation, Pencil, RefreshCw, RotateCcw, Route as RouteIcon, ShieldCheck, Sparkles, Star, Ticket, Users, Utensils, Wrench, XCircle } from 'lucide-react';
import { cinemas, movies, restaurants } from './data';
import { applyPlanUpdate, approvePlan, bestDinnerSlot, createBlankPlan, evaluatePlan, isPlanImmutable, immutableReason, rankedDinnerSlots, reconcileAbandonedReservation, repairPlan, reservePlan, snapshotPlan, solvePlan, startNewPlan } from './domain';
import { resolveAuthority } from './authority';
import { compareAndSwapState, loadState, resetWorkspace, subscribeState } from './persistence';
import { demoProvider } from './providers';
import { buildTools, toolNames } from './tools';
import { Activity, ActivitySource, Plan, Preferences, Reservation, Tab, ToolError } from './types';
import { constraintsSchema, parseInput, planningWindow } from './validation';
import { checkLabel, formatPlanDate, peopleLabel, planStarted, STATUS_WORDS } from './labels';

const money=(value:number|null|undefined)=>value==null?'—':`৳${value.toLocaleString('en-IN')}`;
const prettyTime=(value?:string)=>value?new Date(`2026-01-01T${value}:00`).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'}):'—';
const uid=()=>typeof crypto!=='undefined'&&crypto.randomUUID?crypto.randomUUID():`${Date.now()}-${Math.random()}`;
const sourceLabel:Record<ActivitySource,string>={'human':'Human edit','external-agent':'WebMCP tool execution','quick-planner':'Local deterministic solver','system':'Workspace sync'};
const statusLabel=(plan:Plan,evaluation:ReturnType<typeof evaluatePlan>)=>plan.status==='reserved'?'Reserved · confirmed':plan.status==='reservation_pending'?'Reservation pending':plan.status==='reservation_failed'?'Reservation failed':plan.status==='approved'?'Approved · awaiting confirmation':evaluation.valid?'Ready for review':plan.selections.restaurantId?'Draft · needs attention':'Draft · not started';
type WebMcpState='registering'|'active'|'unavailable'|'error';
type MutationOutcome={ok:true}|{ok:false;error:ToolError};

export default function App(){
  // On load, nothing is in flight in this process, so a `reservation_pending` plan left behind
  // by a closed or crashed tab is resolved against the ledger instead of staying frozen forever.
  const [restored]=useState(()=>{const state=loadState();demoProvider.reset();demoProvider.importState(state.provider);const recovered=reconcileAbandonedReservation(state.plan,demoProvider);
    const note=recovered.resolved==='none'?state.activity:[{id:uid(),text:recovered.resolved==='reserved'?`Recovered confirmed reservation ${recovered.plan.reservation?.id}`:'Released an interrupted reservation attempt',detail:recovered.resolved==='reserved'?'The provider ledger held a matching commitment for this exact version':'No inventory was consumed; approve again when you are ready',source:'system' as ActivitySource,timestamp:new Date().toISOString(),planVersion:recovered.plan.version},...state.activity].slice(0,40);
    return {state:{...state,plan:recovered.plan,activity:note},storedPlan:state.plan,resolved:recovered.resolved};});
  const [tab,setTab]=useState<Tab>(()=>restored.state.plan.selections.restaurantId?'plan':'goal');
  const [plan,setPlanState]=useState<Plan>(restored.state.plan);
  const [activity,setActivity]=useState<Activity[]>(restored.state.activity);
  const [providerTick,setProviderTick]=useState(demoProvider.revision);
  const [syncMessage,setSyncMessage]=useState(restored.resolved==='reserved'?'An interrupted reservation was recovered from the provider ledger.':restored.resolved==='failed'?'An interrupted reservation attempt was released; no inventory was consumed.':'This browser tab is current.');
  const [webmcp,setWebmcp]=useState<WebMcpState>(()=>typeof document.modelContext?.registerTool==='function'?'registering':'unavailable');
  const [toast,setToast]=useState<{tone:'ok'|'error';text:string}|null>(null);
  const [agentBusy,setAgentBusy]=useState(0);
  const authority=useMemo(()=>resolveAuthority(demoProvider,{endpoint:import.meta.env.VITE_PLANONIT_AUTHORITY_ENDPOINT}),[]);
  const planRef=useRef(plan);const activityRef=useRef(activity);const writerId=useRef(uid());
  const snapshot=useMemo(()=>{void providerTick;return snapshotPlan(plan,demoProvider);},[plan,providerTick]);

  // The expected token is the plan as it was *stored*, so a recovered pending plan can be
  // written back once without tripping the concurrency guard against its own predecessor.
  useEffect(()=>{void compareAndSwapState({plan:restored.storedPlan},{plan:planRef.current,activity:activityRef.current,provider:demoProvider.exportState(),writerId:writerId.current});},[restored.storedPlan]);
  useEffect(()=>subscribeState(incoming=>{
    if(incoming.writerId===writerId.current)return;
    const current=planRef.current;
    if(incoming.plan.version<current.version)return;
    const sameToken=incoming.plan.version===current.version&&incoming.plan.updatedAt===current.updatedAt;
    if(sameToken&&(!incoming.provider||incoming.provider.revision<=demoProvider.revision))return;
    demoProvider.importState(incoming.provider);planRef.current=incoming.plan;activityRef.current=incoming.activity;setPlanState(incoming.plan);setActivity(incoming.activity);setProviderTick(demoProvider.revision);setSyncMessage(`Synced authoritative version ${incoming.plan.version} from another tab.`);
  }),[]);

  const announce=useCallback((text:string,tone:'ok'|'error'='ok')=>{setToast({text,tone});window.setTimeout(()=>setToast(null),3600);},[]);
  const commit=useCallback(async(next:Plan,text:string,source:ActivitySource,detail?:string)=>{
    const expected={plan:structuredClone(planRef.current)};
    const nextActivity=[{id:uid(),text,detail:detail??sourceLabel[source],source,timestamp:new Date().toISOString(),planVersion:next.version},...activityRef.current].slice(0,40);
    const saved=await compareAndSwapState(expected,{plan:next,activity:nextActivity,provider:demoProvider.exportState(),writerId:writerId.current});
    if(!saved.ok){const authoritative=loadState();demoProvider.importState(authoritative.provider);planRef.current=authoritative.plan;activityRef.current=authoritative.activity;setPlanState(authoritative.plan);setActivity(authoritative.activity);setProviderTick(demoProvider.revision);setSyncMessage('Concurrent edit blocked; authoritative state loaded.');return saved;}
    planRef.current=next;activityRef.current=nextActivity;setPlanState(next);setActivity(nextActivity);setProviderTick(demoProvider.revision);return saved;
  },[]);
  const commitExternal=useCallback(async(next:Plan,text:string)=>{const result=await commit(next,text,'external-agent');if(result.ok)announce('Agent updated the shared workspace');return result;},[announce,commit]);

  useEffect(()=>{
    if(typeof document.modelContext?.registerTool!=='function')return;
    const controller=new AbortController();
    const registered=buildTools(()=>planRef.current,commitExternal,demoProvider,authority);
    // Wrap only the real execute path, so the header reflects actual agent work and nothing else.
    const tools=registered.map(tool=>({...tool,execute:async(input:unknown)=>{setAgentBusy(count=>count+1);try{return await tool.execute(input);}finally{setAgentBusy(count=>Math.max(0,count-1));}}}));
    Promise.all(tools.map(tool=>document.modelContext!.registerTool(tool,{signal:controller.signal}))).then(()=>setWebmcp('active')).catch(()=>setWebmcp('error'));
    return()=>controller.abort();
  },[authority,commitExternal]);

  // One human-readable line. Structured details stay on the WebMCP envelope; the toast never
  // repeats the same sentence twice (the duplicated-message defect from the previous audit).
  const showError=(error:ToolError)=>{
    const detail=error.details?.find(item=>{const text=item.includes(': ')?item.slice(item.indexOf(': ')+2):item;return text.trim()!==error.message.trim();});
    announce(detail?`${error.message} ${detail.includes(': ')?detail.slice(detail.indexOf(': ')+2):detail}`:error.message,'error');
  };
  const blockedByLifecycle=()=>{
    const current=planRef.current;
    if(!isPlanImmutable(current))return false;
    showError({code:current.status==='reservation_pending'?'RESERVATION_IN_PROGRESS':'WORKSPACE_HAS_ACTIVE_RESERVATION',message:current.status==='reservation_pending'?immutableReason(current):`Reservation ${current.reservation?.id??''} is committed to version ${current.version}. Start a new plan to keep it and plan again.`,retryable:false});
    return true;
  };
  const startNew=async()=>{const result=startNewPlan(planRef.current,planRef.current.version,demoProvider);if(!result.ok){showError(result.error);return;}const archived=result.data.archivedReservation;const saved=await commit(result.data.plan,archived?`Started a new plan; ${archived.id} stays committed`:'Started a new plan','human',archived?`Reservation ${archived.id} remains committed to version ${archived.version}`:'Fresh draft from the same constraints');if(!saved.ok){showError(saved.error);return;}setTab('goal');announce(archived?'New plan started. Your previous reservation is still listed.':'New plan started.');};
  const update=async(change:Record<string,unknown>,text:string):Promise<MutationOutcome>=>{
    const result=applyPlanUpdate(planRef.current,{expectedVersion:planRef.current.version,...change},demoProvider);
    if(!result.ok){showError(result.error);return result;}
    if(!result.data.changed)return {ok:true};const saved=await commit(result.data.plan,text,'human');if(!saved.ok){showError(saved.error);return saved;}return {ok:true};
  };
  const changeDate=async(date:string):Promise<MutationOutcome>=>{
    if(blockedByLifecycle())return {ok:false,error:{code:'WORKSPACE_HAS_ACTIVE_RESERVATION',message:'Start a new plan first.',retryable:false}};
    const current=planRef.current;const parsed=parseInput(constraintsSchema,{city:current.city,date,people:current.people,budget:current.budget});
    if(!parsed.ok){showError(parsed.error);return parsed;}
    if(date===current.date)return {ok:true};
    const next=createBlankPlan({date:parsed.data.date,people:current.people,budget:current.budget});next.version=current.version+1;next.preferences=current.preferences;next.changeSummary='Changed date and cleared dependent selections';
    const saved=await commit(next,'Changed date; dependent choices were cleared','human');if(!saved.ok){showError(saved.error);return saved;}return {ok:true};
  };
  const runQuickPlanner=async()=>{if(blockedByLifecycle())return;const current=planRef.current;const result=solvePlan({city:'Dhaka',date:current.date,people:current.people,budget:current.budget,preferences:current.preferences,dinnerDurationMinutes:current.dinnerDurationMinutes,bufferMinutes:current.bufferMinutes},current.version,undefined,demoProvider);if(!result.ok){showError(result.error);return;}const saved=await commit(result.plan,`Local preview created valid plan v${result.plan.version}`,'quick-planner','Local solver preview — not an agent call');if(!saved.ok){showError(saved.error);return;}setTab('plan');announce('Local preview found a feasible combination');};
  const quickRepair=async()=>{if(blockedByLifecycle())return;const result=repairPlan(planRef.current,{expectedVersion:planRef.current.version,preserveRestaurant:true,preserveMovie:false},demoProvider);if(!result.ok){showError(result.error);return;}const saved=await commit(result.plan,`Local repair restored feasibility in v${result.plan.version}`,'quick-planner','Local fallback for testing repair_plan');if(!saved.ok){showError(saved.error);return;}announce('Plan repaired while preserving dinner');};
  const approve=async()=>{const result=approvePlan(planRef.current,planRef.current.version,demoProvider);if(!result.ok){showError(result.error);return;}const saved=await commit(result.data.plan,`Human approved valid version ${result.data.plan.version}`,'human',`Bound to provider revision ${demoProvider.revision}`);if(!saved.ok){showError(saved.error);return;}announce('This exact plan and inventory revision are approved');};
  const resetWorkspaceState=async()=>{
    const current=planRef.current;const ledger=demoProvider.listReservations();
    const result=resetWorkspace(current,demoProvider.exportState());
    if(!result.ok){showError(result.error);return;}
    const next=result.data;
    demoProvider.importState(next.provider);
    planRef.current=next.plan;activityRef.current=[];setPlanState(next.plan);setActivity([]);setProviderTick(demoProvider.revision);
    await compareAndSwapState({plan:next.plan},{plan:next.plan,activity:[],provider:demoProvider.exportState(),writerId:writerId.current});
    setTab('goal');
    announce(ledger.length?'Workspace reset. Existing sandbox reservations stay committed and listed.':'Workspace reset to a fresh plan.');
  };
  const reserve=async()=>{const result=await reservePlan(planRef.current,planRef.current.version,demoProvider,async pending=>{await commit(pending,`Reservation pending for version ${pending.version}`,'system',authority.kind==='remote'?'Awaiting the authoritative reservation service':'Provider confirmation in progress');},authority,()=>planRef.current);if(!result.ok){if(result.error.code==='RESERVATION_STATE_CHANGED'){const authoritative=loadState();demoProvider.importState(authoritative.provider);planRef.current=authoritative.plan;activityRef.current=authoritative.activity;setPlanState(authoritative.plan);setActivity(authoritative.activity);setProviderTick(demoProvider.revision);setSyncMessage('A newer version arrived while the reservation was in flight; the newer state was kept.');showError(result.error);return;}if(result.plan){const saved=await commit(result.plan,`Reservation failed: ${result.error.code}`,'human',result.error.message);if(!saved.ok){showError(saved.error);return;}}showError(result.error);return;}const saved=await commit(result.data.plan,`${result.data.idempotent?'Returned':'Created'} ${result.data.reservationId}`,'human',result.data.message);if(!saved.ok){showError(saved.error);return;}announce(result.data.idempotent?'Existing confirmation returned':'Sandbox inventory confirmed');};

  return <div className="app">
    <Header tab={tab} setTab={setTab} webmcp={webmcp} agentWorking={agentBusy>0}/>
    <main className="main">
      <PlanStrip plan={plan} snapshot={snapshot} setTab={setTab}/>
      {tab==='goal'&&<Goal plan={plan} snapshot={snapshot} webmcp={webmcp} update={update} changeDate={changeDate} runQuickPlanner={runQuickPlanner} setTab={setTab}/>}
      {tab==='explore'&&<Explore plan={plan} snapshot={snapshot} update={update}/>}
      {tab==='plan'&&<PlanView plan={plan} snapshot={snapshot} approve={approve} reserve={reserve} quickRepair={quickRepair} setTab={setTab} startNew={startNew} reservations={demoProvider.listReservations()} resetWorkspaceState={resetWorkspaceState}/>}
      {tab==='activity'&&<ActivityView activity={activity} syncMessage={syncMessage} webmcp={webmcp}/>}
    </main>
    {/* One announcement, not two: the persistent live region is the only thing assistive tech
        reads, and the visible toast is decorative. Errors escalate it to assertive. */}
    <div className="sr-live" role={toast?.tone==='error'?'alert':'status'} aria-live={toast?.tone==='error'?'assertive':'polite'}>{toast?.text}</div><div className="sr-live" role="status" aria-live="polite">{planStarted(plan)?(snapshot.evaluation.valid?`Your evening works. ${STATUS_WORDS[plan.status]}.`:`${snapshot.evaluation.checks.filter(item=>!item.passed).length} ${snapshot.evaluation.checks.filter(item=>!item.passed).length===1?'thing needs':'things need'} attention.`):'Nothing planned yet.'}</div>
    {toast&&<div className={`toast ${toast.tone}`} aria-hidden="true">{toast.tone==='ok'?<CheckCircle2/>:<AlertTriangle/>}{toast.text}</div>}
  </div>;
}

function Header({tab,setTab,webmcp,agentWorking}:{tab:Tab;setTab:(tab:Tab)=>void;webmcp:WebMcpState;agentWorking:boolean}){
  const nav:[Tab,string,React.ReactNode][]=[['goal','1. Goal',<Sparkles/>],['explore','2. Explore',<Pencil/>],['plan','3. Plan',<ShieldCheck/>],['activity','Activity',<History/>]];
  // Arrow keys move between steps the way a keyboard user expects; Tab still exits the group.
  const onKey=(event:React.KeyboardEvent<HTMLElement>)=>{
    const order=nav.map(([id])=>id);const index=order.indexOf(tab);
    const next=event.key==='ArrowRight'||event.key==='ArrowDown'?index+1:event.key==='ArrowLeft'||event.key==='ArrowUp'?index-1:event.key==='Home'?0:event.key==='End'?order.length-1:-1;
    if(next<0)return;
    event.preventDefault();
    const target=order[Math.max(0,Math.min(order.length-1,next))];
    setTab(target);
    (event.currentTarget.querySelectorAll('button')[order.indexOf(target)] as HTMLButtonElement|undefined)?.focus();
  };
  return <header className="topbar"><Brand/><nav aria-label="Planning steps" onKeyDown={onKey}>{nav.map(([id,label,icon])=><button key={id} className={tab===id?'active':''} aria-current={tab===id?'page':undefined} onClick={()=>setTab(id)}>{icon}<span>{label}</span></button>)}</nav><WebMcpBadge state={webmcp} working={agentWorking}/></header>;
}
function Brand(){return <button className="brand" onClick={()=>window.scrollTo({top:0,behavior:'smooth'})} aria-label="PlanOnIt home"><span className="brandmark">P</span><span>plan<span>on</span>it</span></button>;}
function WebMcpBadge({state,working}:{state:WebMcpState;working:boolean}){
  const copy={registering:'Connecting tools…',active:`Agent-ready · ${toolNames.length} tools`,unavailable:'Manual mode',error:'Tool setup failed'};
  // "Working" is set only by a real registered-tool invocation. Nothing here simulates an agent.
  const label=state==='active'&&working?'Agent working…':copy[state];
  return <div className={`webmcp-pill ${state}${working?' working':''}`} title={label} aria-live="polite"><span className="pulse"/>{label}</div>;
}

function PlanStrip({plan,snapshot,setTab}:{plan:Plan;snapshot:ReturnType<typeof snapshotPlan>;setTab:(tab:Tab)=>void}){
  // Before anything is chosen there is nothing to score, and a "2/10 checks" badge on an
  // untouched plan reads as a failing grade for work the person has not started.
  const started=planStarted(plan);
  const failed=snapshot.evaluation.checks.filter(item=>!item.passed).length;
  return <section className="plan-strip" aria-label="Current plan summary">
    <div><span className={`state-dot ${!started?'idle':snapshot.evaluation.valid?'pass':'fail'}`}/><strong>{STATUS_WORDS[plan.status]}</strong><span>{formatPlanDate(plan.date)} · <span className="strip-people"><Users/>{peopleLabel(plan.people)}</span> · {money(plan.budget)} budget</span></div>
    <div className="strip-actions">{started&&!snapshot.evaluation.valid&&<span className="strip-flag">{failed} to fix</span>}<button onClick={()=>setTab('plan')}>{!started?'Start planning':snapshot.evaluation.valid?'Review plan':'See what needs attention'} <ArrowRight/></button></div>
  </section>;
}

function Goal({plan,snapshot,webmcp,update,changeDate,runQuickPlanner,setTab}:{plan:Plan;snapshot:ReturnType<typeof snapshotPlan>;webmcp:WebMcpState;update:(change:Record<string,unknown>,text:string)=>Promise<MutationOutcome>;changeDate:(date:string)=>Promise<MutationOutcome>;runQuickPlanner:()=>void;setTab:(tab:Tab)=>void}){
  const prompt=`Plan a ${plan.date} evening in Dhaka for ${plan.people} people under ৳${plan.budget}. Use PlanOnIt's site tools, show me feasibility evidence, and leave approval to me.`;
  const copy=()=>navigator.clipboard?.writeText(prompt);
  return <>
    <section className="hero"><div className="hero-copy"><div className="eyebrow">AGENT-FIRST EVENING PLANNER</div><h1>Tell an agent what you want.<br/><span>Keep the final say.</span></h1><p>PlanOnIt gives an AI agent live planning tools, a shared draft, and hard safety gates. You inspect the evidence and approve the exact version.</p><div className="hero-actions"><button className="primary" onClick={copy}><Copy/> Copy agent request</button><button className="secondary" onClick={()=>setTab('explore')}>Build manually <ArrowRight/></button></div></div><div className="how-card"><div><span>1</span><p><strong>Set the goal</strong>Choose date, group, and budget.</p></div><div><span>2</span><p><strong>Agent builds</strong>Site tools write the same draft.</p></div><div><span>3</span><p><strong>You approve</strong>Only a valid current version proceeds.</p></div></div></section>
    <section className="goal-grid"><div className="panel constraints-panel"><div className="section-heading"><div><div className="eyebrow">YOUR GOAL</div><h2>Start with the essentials</h2></div><span>Saved automatically</span></div><ConstraintEditor key={`${plan.people}:${plan.budget}`} plan={plan} update={update} changeDate={changeDate}/></div><div className="panel agent-card"><div className="agent-icon"><Bot/></div><div className="eyebrow">USE AN AI AGENT</div><h2>{webmcp==='active'?'Your agent can use this page':'Open in a WebMCP-enabled ChatGPT browser'}</h2><p>An external agent can compare options, build or repair the shared plan, and explain its choices. Only you can approve it.</p><div className="prompt-box"><code>{prompt}</code><button aria-label="Copy agent request" onClick={copy}><Copy/></button></div><div className={`status-line ${webmcp}`}><span/>{webmcp==='active'?'Agent tools are available':'Manual planning and local preview still work'}</div></div></section>
    <section className="decision-row"><div><div className="eyebrow">YOUR NEXT STEP</div><h2>{plan.status==='reserved'?'This plan is reserved. Start a new plan to plan again.':snapshot.evaluation.valid?'Your plan is ready for review.':'Create a feasible first draft.'}</h2><p>{snapshot.evaluation.valid?'Check the itinerary, budget, and evidence before you approve.':'Use the transparent local preview, build manually, or copy the prompt for an external agent.'}</p></div><div>{plan.status==='reserved'?<button className="primary" onClick={()=>setTab('plan')}><ShieldCheck/> View your reservation <ArrowRight/></button>:snapshot.evaluation.valid?<button className="primary" onClick={()=>setTab('plan')}>Review plan <ArrowRight/></button>:<button className="primary" onClick={runQuickPlanner}><Sparkles/> Create plan preview</button>}</div></section>
  </>;
}

function ConstraintEditor({plan,update,changeDate}:{plan:Plan;update:(change:Record<string,unknown>,text:string)=>Promise<MutationOutcome>;changeDate:(date:string)=>Promise<MutationOutcome>}){
  const [people,setPeople]=useState(String(plan.people));const [budget,setBudget]=useState(String(plan.budget));const [errors,setErrors]=useState<Record<string,string>>({});
  // Immutable plans disable their inputs instead of offering edits that are guaranteed to fail.
  const locked=isPlanImmutable(plan);
  const commitNumber=async(field:'people'|'budget',raw:string)=>{const result=await update({[field]:Number(raw)},field==='people'?'Changed party size':'Changed total budget');if(!result.ok)setErrors(current=>({...current,[field]:result.error.message}));else setErrors(current=>({...current,[field]:''}));};
  const patchPreferences=(patch:Partial<Preferences>)=>update({preferences:{...plan.preferences,...patch}},'Updated planning preferences');
  const onDate=async(value:string)=>{const result=await changeDate(value);setErrors(current=>({...current,date:result.ok?'':result.error.message}));};
  return <div className={`constraint-editor ${locked?'locked':''}`}>
    {locked&&<p className="locked-note" role="status"><Lock/> {immutableReason(plan)}</p>}
    <label><span><MapPin/> City</span><select aria-label="City" value={plan.city} disabled><option>Dhaka</option></select></label>
    <label><span><CalendarDays/> Date</span><input aria-label="Date" type="date" disabled={locked} min={planningWindow().start} max={planningWindow().end} value={plan.date} aria-invalid={Boolean(errors.date)} aria-describedby={errors.date?'date-error':undefined} onChange={event=>void onDate(event.target.value)}/>{errors.date&&<small id="date-error" className="field-error" role="alert">{errors.date}</small>}</label>
    <label><span><Utensils/> People</span><input aria-label="People" type="number" disabled={locked} min="1" max="12" value={people} aria-invalid={Boolean(errors.people)} aria-describedby={errors.people?'people-error':undefined} onChange={event=>setPeople(event.target.value)} onBlur={()=>void commitNumber('people',people)}/>{errors.people&&<small id="people-error" className="field-error" role="alert">{errors.people}</small>}</label>
    <label><span><CircleDollarSign/> Budget</span><input aria-label="Budget" type="number" disabled={locked} min="500" max="100000" step="100" value={budget} aria-invalid={Boolean(errors.budget)} aria-describedby={errors.budget?'budget-error':undefined} onChange={event=>setBudget(event.target.value)} onBlur={()=>void commitNumber('budget',budget)}/>{errors.budget&&<small id="budget-error" className="field-error" role="alert">{errors.budget}</small>}</label>
    <label><span><Star/> Cuisine preference</span><select aria-label="Cuisine preference" disabled={locked} value={plan.preferences.cuisine??''} onChange={event=>patchPreferences({cuisine:event.target.value||undefined})}><option value="">Any cuisine</option>{[...new Set(restaurants.map(item=>item.cuisine))].map(item=><option key={item}>{item}</option>)}</select></label>
    <label><span><Ticket/> Movie preference</span><select aria-label="Movie preference" disabled={locked} value={plan.preferences.movieGenre??''} onChange={event=>patchPreferences({movieGenre:event.target.value||undefined})}><option value="">Any genre</option>{[...new Set(movies.map(item=>item.genre))].map(item=><option key={item}>{item}</option>)}</select></label>
    <label><span><Navigation/> Transport</span><select aria-label="Transport preference" disabled={locked} value={plan.preferences.transport} onChange={event=>patchPreferences({transport:event.target.value as Preferences['transport']})}><option value="lowest_cost">Lowest cost</option><option value="comfortable">Comfortable</option><option value="fastest">Fastest</option></select></label>
    <label><span><Sparkles/> Priority</span><select aria-label="Planning priority" disabled={locked} value={plan.preferences.priority} onChange={event=>patchPreferences({priority:event.target.value as Preferences['priority']})}><option value="balanced">Balanced</option><option value="lowest_cost">Lowest cost</option><option value="highest_rated">Highest rated</option></select></label>
  </div>;
}

function Explore({plan,snapshot,update}:{plan:Plan;snapshot:ReturnType<typeof snapshotPlan>;update:(change:Record<string,unknown>,text:string)=>Promise<MutationOutcome>}){
  const currentShowtime=demoProvider.getShowtime(plan.selections.showtimeId);const currentCinema=demoProvider.getCinema(currentShowtime?.cinemaId);const currentRestaurant=demoProvider.getRestaurant(plan.selections.restaurantId);const route=demoProvider.getRoute(currentRestaurant?.locationId,currentCinema?.locationId);const shows=demoProvider.showtimesForDate(plan.date);
  const immutable=isPlanImmutable(plan);
  const chooseRestaurant=(restaurantId:string,name:string)=>{
    const slot=bestDinnerSlot(plan,restaurantId,demoProvider)??rankedDinnerSlots(plan,restaurantId,demoProvider).find(item=>item.hasCapacity&&item.withinHours);
    if(!slot)return;
    void update({restaurantId,restaurantSlot:slot.time},`Chose ${name} for dinner at ${slot.time}`);
  };
  return <><PageTitle eyebrow="BUILD YOUR EVENING" title="Film first, then dinner." body={`Planning for ${plan.people} ${plan.people===1?'person':'people'} on ${plan.date}. PlanOnIt books the table for after the film, using the same checks the agent tools use.`} status={snapshot.evaluation.valid?'Feasible':'Needs attention'}/>
    {immutable&&<div className="locked-banner" role="status"><Lock/><span>{immutableReason(plan)}</span></div>}
    <section className="explore-section"><SectionTitle number="01" title="Movie" subtitle="The film sets the shape of the evening. Movie and showtime are chosen together."/><div className="card-grid">{movies.map(movie=>{const movieShows=shows.filter(item=>item.movieId===movie.id&&item.seatsRemaining>=plan.people);return <article className={`choice-card ${plan.selections.movieId===movie.id?'selected':''}`} key={movie.id}><div className="choice-top"><span className="choice-emoji">{movie.poster}</span><div><h3>{movie.title}</h3><p>{movie.genre} · {Math.floor(movie.durationMinutes/60)}h {movie.durationMinutes%60}m</p></div><span className="rating"><Star/> {movie.rating}</span></div><p>{movie.description}</p><div className="slot-row">{movieShows.length?movieShows.map(show=><button disabled={immutable} className={plan.selections.showtimeId===show.id?'active':''} key={show.id} onClick={()=>update({movieId:movie.id,showtimeId:show.id},`Selected ${movie.title} at ${show.startTime}`)}>{prettyTime(show.startTime)} <small>{money(show.price)} · {cinemas.find(item=>item.id===show.cinemaId)?.name.split(',')[0]}</small></button>):<small className="unavailable">No screening fits this group today</small>}</div></article>})}</div></section>
    <section className="explore-section"><SectionTitle number="02" title="Dinner after the film" subtitle={currentShowtime?'PlanOnIt books the first table you can comfortably reach after the credits.':'Pick a film first — the table is booked around it.'}/><div className="card-grid">{restaurants.map(restaurant=>{
      const ranked=rankedDinnerSlots(plan,restaurant.id,demoProvider);const best=ranked.find(item=>item.feasible);const chosen=plan.selections.restaurantId===restaurant.id;
      const bookable=Boolean(currentShowtime&&best);
      return <article className={`choice-card ${chosen?'selected':''}`} key={restaurant.id}><div className="choice-top"><span className="choice-emoji">{restaurant.image}</span><div><h3>{restaurant.name}</h3><p>{restaurant.cuisine} · {demoProvider.getLocation(restaurant.locationId)?.area}</p></div><span className="rating"><Star/> {restaurant.rating}</span></div><p>{restaurant.description}</p>
      <div className="choice-meta"><span className="price-band">{money(restaurant.priceRangeMin)}–{money(restaurant.priceRangeMax)} / person</span><span><Clock3/> Open {restaurant.openingHours}</span></div>
      <div className="choice-action">{chosen&&plan.selections.restaurantSlot?<span className="chosen-slot"><Check/> Table at {prettyTime(plan.selections.restaurantSlot)} for {plan.people}</span>:bookable?<span className="suggested-slot">Table around {prettyTime(best!.time)}</span>:null}
      {/* One control per card: its label carries the reason, so there is never a button next to a competing message. */}
      <button className="secondary" disabled={immutable||!bookable||chosen} onClick={()=>chooseRestaurant(restaurant.id,restaurant.name)}>{chosen?'Selected':bookable?'Choose this restaurant':!currentShowtime?'Choose a film first':ranked.some(item=>item.hasCapacity)?'No table fits after this film':'Fully booked for this group'}</button></div></article>})}</div></section>
    <section className="explore-section"><SectionTitle number="03" title="Getting there" subtitle="How you travel from the cinema to the restaurant. Only route-backed options appear."/>{route?<div className="route-card"><div className="route-summary"><RouteIcon/><div><strong>{currentCinema?.name.split(',')[0]??demoProvider.getLocation(route.toLocationId)?.name} → {currentRestaurant?.name??demoProvider.getLocation(route.fromLocationId)?.name}</strong><span>{route.distanceKm} km after the film</span></div></div><div className="transport-grid">{route.options.map(option=><button disabled={immutable} className={plan.selections.transportOptionId===option.id?'selected':''} key={option.id} onClick={()=>update({transportOptionId:option.id},`Selected ${option.name}`)}><Navigation/><strong>{option.name}</strong><span>{option.durationMinutes} min · {money(option.fare)}</span><small>{option.description}</small></button>)}</div></div>:<Empty icon={<RouteIcon/>} title="Choose a film and a restaurant first" body="Then PlanOnIt can resolve a real route between the two venues."/>}</section>
  </>;
}

function PlanView({plan,snapshot,approve,reserve,quickRepair,setTab,startNew,reservations,resetWorkspaceState}:{plan:Plan;snapshot:ReturnType<typeof snapshotPlan>;approve:()=>void;reserve:()=>void;quickRepair:()=>void;setTab:(tab:Tab)=>void;startNew:()=>void;reservations:Reservation[];resetWorkspaceState:()=>void}){
  const {evaluation,restaurant,movie,showtime,cinema,transport,route}=snapshot;const failed=evaluation.checks.filter(item=>!item.passed);const immutable=isPlanImmutable(plan);
  const repairPrompt=`Repair PlanOnIt plan v${plan.version}. Preserve the restaurant if possible, explain every changed dependency, and validate the result.`;
  const repaired=plan.changeSummary.toLowerCase().includes('repair')&&evaluation.valid;
  const started=planStarted(plan);

  // Nothing chosen yet is not a broken plan. Showing eight blocking failures for an evening the
  // person has not started makes a working product look broken on the very first screen.
  if(!started)return <>
    <PageTitle eyebrow="YOUR EVENING" title="Nothing planned yet." body={`${formatPlanDate(plan.date)} · ${peopleLabel(plan.people)} · ${money(plan.budget)} to spend.`} status="Draft"/>
    <section className="panel start-empty">
      <Empty icon={<Ticket/>} title="Start with the film" body="PlanOnIt builds the evening around your showtime: the film first, then the journey, then a table booked for when you arrive."/>
      <div className="start-actions">
        <button className="primary" onClick={()=>setTab('explore')}><Ticket/> Choose a film <ArrowRight/></button>
        <button className="secondary" onClick={()=>setTab('goal')}><Sparkles/> Change date, group or budget</button>
      </div>
    </section>
    <BookingHistory plan={plan} reservations={reservations}/>
    <PlanFooter plan={plan} reservations={reservations} resetWorkspaceState={resetWorkspaceState}/>
  </>;

  return <><PageTitle eyebrow="CURRENT PLAN" title="Your evening, ready to verify." body={`${formatPlanDate(plan.date)} · ${peopleLabel(plan.people)} · ${movie?.title??'A film'}, then dinner at ${restaurant?.name??'a restaurant'}.`} status={statusLabel(plan,evaluation)}/>
    {plan.status==='reservation_failed'&&<section className="repair-callout"><div><AlertTriangle/><div><div className="eyebrow">CONFIRMATION FAILED</div><h2>Your plan is safe; nothing was booked.</h2><p>{plan.reservation?.failureCode}. Review the details and approve again when ready.</p></div></div></section>}
    {repaired&&<section className="repair-success"><CheckCircle2/><div><div className="eyebrow">PLAN REPAIRED</div><h2>Your evening works again.</h2><ul><li>Dinner preserved where requested</li><li>Film and travel choices recalculated</li><li>Timing and budget now work</li></ul></div></section>}
    {!evaluation.valid&&immutable&&<section className="repair-callout"><div><Lock/><div><div className="eyebrow">{plan.status==='reserved'?'BOOKING MISMATCH':'BOOKING IN PROGRESS'}</div><h2>{plan.status==='reserved'?'This booking no longer matches the plan on screen.':'Your booking is being confirmed.'}</h2><ul>{failed.map(item=><li key={item.id}><strong>{checkLabel(item)}:</strong> {item.message}</li>)}</ul><p>{immutableReason(plan)}</p></div></div></section>}
    {!evaluation.valid&&!immutable&&<section className="repair-callout"><div><AlertTriangle/><div><div className="eyebrow">NEEDS A FIX</div><h2>{failed[0]?.message??'Something in this evening does not work yet.'}</h2><ul>{failed.slice(1).map(item=><li key={item.id}><strong>{checkLabel(item)}:</strong> {item.message}</li>)}</ul><button className="text-button" onClick={()=>navigator.clipboard?.writeText(repairPrompt)}><Bot/> Copy agent repair prompt</button></div></div><div><button className="primary" onClick={quickRepair}><Wrench/> Fix this for me</button><button className="secondary" onClick={()=>setTab('explore')}><Pencil/> Change my choices</button></div></section>}
    <div className="plan-layout"><div className="plan-main">
      <section className="panel timeline"><div className="section-heading"><div><div className="eyebrow">YOUR EVENING</div><h2>{evaluation.timeline?'Film, travel, then dinner':'Finish choosing to see the timings'}</h2></div><Clock3/></div>
        {evaluation.timeline?<div className="timeline-track">
          <TimelineRow icon={<Ticket/>} time={`${prettyTime(evaluation.timeline.movieStart)}–${prettyTime(evaluation.timeline.movieEnd)}`} title={movie?.title??'Film'} detail={`${cinema?.name} · ${showtime?.inventoryState==='committed_to_current_plan'?`${showtime.committedQuantity} seats confirmed for you`:`${plan.people} tickets`}`}/>
          <TimelineRow icon={<Navigation/>} time={`${prettyTime(evaluation.timeline.departAt)}–${prettyTime(evaluation.timeline.arriveAt)}`} title={`Travel · ${transport?.name??'Transport'}`} detail={`${route?.distanceKm} km · about ${transport?.durationMinutes} min from the cinema to the restaurant`}/>
          {evaluation.timeline.slackMinutes>0&&<div className="timeline-wait"><Clock3/><span><strong>{evaluation.timeline.slackMinutes} min to spare</strong> — you arrive around {prettyTime(evaluation.timeline.readyAt)} and the table is held for {prettyTime(evaluation.timeline.dinnerStart)}.</span></div>}
          <TimelineRow icon={<Utensils/>} time={`${prettyTime(evaluation.timeline.dinnerStart)}–${prettyTime(evaluation.timeline.dinnerEnd)}`} title={restaurant?.name??'Restaurant'} detail={`${restaurant?.cuisine} · table for ${plan.people} · open ${restaurant?.openingHours}`}/>
        </div>:<Empty icon={<Clock3/>} title="No timings yet" body="Choose a film, a restaurant and how you will travel."/>}
      </section>
      <section className="panel"><div className="section-heading"><div><div className="eyebrow">{evaluation.valid?'ALL GOOD':'WHAT NEEDS ATTENTION'}</div><h2>{evaluation.valid?'Everything about this evening works':'Here is what to fix'}</h2></div><span className={`score-badge ${evaluation.valid?'pass':'fail'}`}>{evaluation.valid?<Check/>:`${failed.length}`}</span></div>
        {evaluation.valid
          ?<details className="checks-disclosure"><summary>Show the {evaluation.checks.length} checks we ran</summary><CheckGrid checks={evaluation.checks}/></details>
          :<><CheckGrid checks={failed}/><details className="checks-disclosure"><summary>Show all {evaluation.checks.length} checks</summary><CheckGrid checks={evaluation.checks}/></details></>}
      </section>
      <BookingHistory plan={plan} reservations={reservations}/>
    </div>
    <aside className="cost-card"><div className="eyebrow">WHAT IT COSTS</div><h2>{money(evaluation.costs.total)}</h2><div className="budget-meter"><div className={evaluation.costs.remainingBudget!==null&&evaluation.costs.remainingBudget<0?'over':''} style={{width:`${evaluation.costs.total===null?0:Math.min(100,(evaluation.costs.total/plan.budget)*100)}%`}}/></div><div className="budget-row"><span>of {money(plan.budget)}</span><strong className={evaluation.costs.remainingBudget!==null&&evaluation.costs.remainingBudget<0?'danger':''}>{evaluation.costs.remainingBudget===null?'Not priced yet':evaluation.costs.remainingBudget>=0?`${money(evaluation.costs.remainingBudget)} left`:`${money(Math.abs(evaluation.costs.remainingBudget))} over`}</strong></div>
      {evaluation.costs.total!==null&&<div className="breakdown"><CostRow label="Dinner" value={evaluation.costs.restaurant} detail={`${plan.people} × ${money(restaurant?.pricePerPerson)}`}/><CostRow label="Film" value={evaluation.costs.movie} detail={`${plan.people} × ${money(showtime?.price)}`}/><CostRow label="Travel" value={evaluation.costs.transport} detail={transport?.name??'fare for this route'}/></div>}
      <div className={`approval-note ${evaluation.valid?'pass':'fail'}`}>{evaluation.valid?<CheckCircle2/>:<ShieldCheck/>}<span>{plan.status==='reserved'?'Your table and seats are held for this evening.':plan.status==='approved'?'Approved. Confirm to book it.':evaluation.valid?'Nothing is booked until you approve it.':'Approval is blocked until this evening works.'}</span></div>
      {plan.status==='reserved'?<><div className="reservation-confirmed"><CheckCircle2/><strong>{plan.reservation?.id}</strong><span>{movie?.title} at {prettyTime(showtime?.startTime)}, then {restaurant?.name} at {prettyTime(plan.selections.restaurantSlot)}</span><span>{formatPlanDate(plan.date)} · {peopleLabel(plan.people)}</span></div><button className="primary full" onClick={startNew}><Sparkles/> Plan another evening</button><small className="fine-print">Your booking stays and is listed under Your bookings. Planning again never cancels it.</small></>
      :plan.status==='reservation_pending'?<button className="primary full" disabled><RefreshCw/> Booking…</button>
      :plan.status==='approved'?<button className="primary full" onClick={reserve}><ShieldCheck/> Book this evening</button>
      :<button className="primary full" disabled={!evaluation.valid} onClick={approve}><ShieldCheck/> Approve this evening</button>}
      {!immutable&&<button className="text-button full" onClick={()=>setTab('explore')}><Pencil/> Change my choices</button>}
      <small className="fine-print">This is a controlled demo. No real restaurant, cinema, ride or payment is contacted.</small></aside></div>
    <details className="plan-technical"><summary>Technical details</summary><span>Plan v{plan.version} · Provider revision {evaluation.providerRevision} · State: {plan.status}</span></details>
    <PlanFooter plan={plan} reservations={reservations} resetWorkspaceState={resetWorkspaceState}/>
  </>;
}

/** Past commitments stay visible on every screen — a booking must never disappear from view. */
function BookingHistory({plan,reservations}:{plan:Plan;reservations:Reservation[]}){
  if(!reservations.length)return null;
  return <section className="panel"><div className="section-heading"><div><div className="eyebrow">YOUR BOOKINGS</div><h2>Everything PlanOnIt has booked for you</h2></div><ShieldCheck/></div><div className="reservation-history">{reservations.map(item=>{const current=item.planId===plan.id&&item.version===plan.version;return <div key={item.id} className={current?'active':'superseded'}><div><strong>{item.id}</strong><span>{item.inventory.filter(record=>record.state==='committed').length} places held · {new Date(item.reservedAt).toLocaleString()}</span></div><span className={`reservation-tag ${item.status}`}>{item.status==='confirmed'?(current?'This evening':'Still booked · from an earlier plan'):item.status==='failed'?`Not booked · ${item.failureCode??'released'}`:'In progress'}</span></div>})}</div></section>;
}

/** Destructive actions live away from Approve and Book, not beside them. */
function PlanFooter({plan,reservations,resetWorkspaceState}:{plan:Plan;reservations:Reservation[];resetWorkspaceState:()=>void}){
  return <section className="plan-footer"><ResetControl plan={plan} reservations={reservations} resetWorkspaceState={resetWorkspaceState}/></section>;
}

function ActivityView({activity,syncMessage,webmcp}:{activity:Activity[];syncMessage:string;webmcp:WebMcpState}){return <><PageTitle eyebrow="AUDIT TRAIL & AGENT GUIDE" title="One workspace, visible changes." body="Human edits, the local deterministic solver, and external WebMCP agents all write the same versioned workspace. Each row says which one acted." status={webmcp==='active'?'Agent connected':'Manual mode'}/><div className="activity-layout"><section className="panel"><div className="section-heading"><div><div className="eyebrow">VERSION HISTORY</div><h2>Recent workspace activity</h2></div><span className="live-dot">● {syncMessage}</span></div>{activity.length?<div className="activity-list">{activity.map(item=><div className="activity-row" key={item.id}><span className={`activity-avatar ${item.source}`}>{item.source==='external-agent'?<Bot/>:item.source==='quick-planner'?<RefreshCw/>:item.source==='system'?<History/>:'YOU'}</span><div><strong>{item.text}</strong><span>{item.detail} · v{item.planVersion} · {new Date(item.timestamp).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})}</span></div></div>)}</div>:<Empty icon={<History/>} title="No edits yet" body="Agent and human changes will appear here."/>}</section><aside className="panel guide"><div className="eyebrow">AGENT GUIDE</div><h2>{toolNames.length} tools, four jobs</h2><dl><div><dt>Discover</dt><dd>restaurants, details, availability, showtimes, transport</dd></div><div><dt>Plan</dt><dd>create, inspect, validate, calculate cost</dd></div><div><dt>Collaborate</dt><dd>versioned update and signature repair</dd></div><div><dt>Confirm</dt><dd>provider-backed sandbox reservation after human approval</dd></div></dl><p>All tool inputs are strict objects. Side effects are disclosed in descriptions, stale versions fail, and approval cannot be supplied by a tool.</p></aside></div></>}

/**
 * PlanOnIt-only reset with a deliberate confirmation step. It clears this app's own saved
 * state and nothing else in the browser, and it never claims to cancel a commitment that
 * was already made with the provider.
 */
function ResetControl({plan,reservations,resetWorkspaceState}:{plan:Plan;reservations:Reservation[];resetWorkspaceState:()=>void}){
  const [confirming,setConfirming]=useState(false);
  const committed=reservations.filter(item=>item.status==='confirmed');
  if(!confirming)return <button className="text-button full danger" onClick={()=>setConfirming(true)}><RotateCcw/> Reset plan</button>;
  return <div className="reset-confirm" role="alertdialog" aria-label="Confirm reset">
    <strong>Start completely fresh?</strong>
    <ul>
      <li>Clears your current draft (version {plan.version}), your choices, and this workspace&rsquo;s activity history.</li>
      <li>Only PlanOnIt&rsquo;s own saved data is removed. Cookies and other sites are untouched.</li>
      <li>{committed.length?`Your ${committed.length} confirmed sandbox reservation${committed.length>1?'s':''} stay committed and remain in the reservation ledger — a reset does not cancel them.`:'No reservation has been confirmed, so nothing is committed with the provider.'}</li>
    </ul>
    <div className="reset-actions"><button className="secondary" onClick={()=>setConfirming(false)}>Keep my plan</button><button className="primary" onClick={()=>{setConfirming(false);resetWorkspaceState();}}><RotateCcw/> Reset PlanOnIt</button></div>
  </div>;
}

function PageTitle({eyebrow,title,body,status}:{eyebrow:string;title:string;body:string;status:string}){return <div className="page-title"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{body}</p></div><span className="status-chip"><Check/> {status}</span></div>}
function SectionTitle({number,title,subtitle}:{number:string;title:string;subtitle:string}){return <div className="section-title"><span>{number}</span><div><h2>{title}</h2><p>{subtitle}</p></div></div>}
function Empty({icon,title,body}:{icon:React.ReactNode;title:string;body:string}){return <div className="empty-state">{icon}<h3>{title}</h3><p>{body}</p></div>}
function TimelineRow({icon,time,title,detail}:{icon:React.ReactNode;time:string;title:string;detail:string}){return <div className="timeline-row"><span className="timeline-icon">{icon}</span><time>{time}</time><div><strong>{title}</strong><span>{detail}</span></div></div>}
function CheckGrid({checks}:{checks:ReturnType<typeof evaluatePlan>['checks']}){return <div className="check-grid">{checks.map(item=><div className={item.passed?'pass':'fail'} key={item.id}>{item.passed?<CheckCircle2/>:<XCircle/>}<div><strong>{checkLabel(item)}</strong><span>{item.message}</span></div></div>)}</div>}
function CostRow({label,value,detail}:{label:string;value:number|null;detail:string}){return <div><span>{label}<small>{detail}</small></span><strong>{money(value)}</strong></div>}
