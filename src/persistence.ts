import { initialPlan } from './data';
import { Activity, AppState, Plan, ProviderState, ToolResult } from './types';
import { fail, ok, planSchema, providerStateSchema } from './validation';

export const STORAGE_KEY='planonit.state.v5';
const LEGACY_KEYS=['planonit.state.v4','planonit.state.v3','planonit.state.v2'];
/** Every key PlanOnIt owns. Reset touches these and nothing else in the browser. */
export const OWNED_STORAGE_KEYS=[STORAGE_KEY,...LEGACY_KEYS];

export function parseState(raw:string|null):AppState|null{
  if(!raw)return null;
  try{
    const parsed:unknown=JSON.parse(raw);if(!parsed||typeof parsed!=='object')return null;
    const record=parsed as {plan?:unknown;activity?:unknown;provider?:unknown;writerId?:unknown};
    const plan=planSchema.safeParse(record.plan);if(!plan.success)return null;
    const activity=Array.isArray(record.activity)?record.activity.filter(isActivity).slice(0,40):[];
    const provider=providerStateSchema.safeParse(record.provider);
    return {plan:plan.data,activity,provider:provider.success?provider.data:undefined,writerId:typeof record.writerId==='string'?record.writerId:undefined};
  }catch{return null;}
}

export function loadState():AppState{
  if(typeof localStorage==='undefined')return {plan:initialPlan(),activity:[]};
  return parseState(localStorage.getItem(STORAGE_KEY))??LEGACY_KEYS.map(key=>parseState(localStorage.getItem(key))).find(Boolean)??{plan:initialPlan(),activity:[]};
}

export function saveState(plan:Plan,activity:Activity[],provider?:ProviderState,writerId?:string){
  if(typeof localStorage!=='undefined')localStorage.setItem(STORAGE_KEY,JSON.stringify({plan,activity:activity.slice(0,40),provider,writerId}));
}

/**
 * PlanOnIt-only reset.
 *
 * Removes every key this app owns and nothing else — no cookies, no other origins, no
 * unrelated browser data. Provider state (including the reservation ledger) is carried
 * over deliberately: a reset is a local workspace action and must not pretend that a
 * commitment made with the provider was cancelled. Versions keep moving forward so a new
 * plan can never collide with a ledger entry from before the reset.
 */
/**
 * Clears PlanOnIt's own persisted workspace and nothing else.
 *
 * A reservation that is still resolving is refused rather than discarded: its outcome is not
 * yet known, so wiping the plan underneath it would either strand an in-flight commitment or
 * let a late result land on a workspace that no longer expects it. Confirmed reservations are
 * kept in the provider ledger — resetting the planning workspace never cancels a commitment.
 */
export function resetWorkspace(currentPlan:Plan,provider?:ProviderState):ToolResult<AppState>{
  if(currentPlan.status==='reservation_pending')
    return fail('RESERVATION_IN_PROGRESS','A reservation attempt is still resolving. Wait for it to settle before starting fresh.',undefined,true);
  const next:AppState={plan:{...initialPlan(),version:currentPlan.version+1,city:currentPlan.city,changeSummary:'Workspace reset to a fresh plan'},activity:[],provider};
  if(typeof localStorage!=='undefined'){for(const key of OWNED_STORAGE_KEYS)localStorage.removeItem(key);}
  saveState(next.plan,next.activity,next.provider);
  return ok(next);
}

export interface StateToken {plan:Plan;}
export async function compareAndSwapState(expected:StateToken,next:AppState){
  const operation=()=>{
    const current=parseState(localStorage.getItem(STORAGE_KEY));
    const expectedPlan=planSchema.parse(expected.plan);
    if(current&&JSON.stringify(current.plan)!==JSON.stringify(expectedPlan))return fail('CONCURRENT_WRITE_CONFLICT',`The workspace changed in another tab from version ${expected.plan.version}. The newer state was loaded; retry against version ${current.plan.version}.`,undefined,true);
    saveState(next.plan,next.activity,next.provider,next.writerId);return ok({state:next});
  };
  if(typeof localStorage==='undefined')return ok({state:next});
  const locks=(navigator as Navigator&{locks?:{request:<T>(name:string,options:{mode:'exclusive'},callback:()=>T|Promise<T>)=>Promise<T>}}).locks;
  return locks?locks.request('planonit-workspace-write',{mode:'exclusive'},operation):operation();
}

export function subscribeState(listener:(state:AppState)=>void){
  if(typeof window==='undefined')return()=>undefined;
  const onStorage=(event:StorageEvent)=>{if(event.key!==STORAGE_KEY)return;const state=parseState(event.newValue);if(state)listener(state);};
  window.addEventListener('storage',onStorage);return()=>window.removeEventListener('storage',onStorage);
}

function isActivity(value:unknown):value is Activity{if(!value||typeof value!=='object')return false;const item=value as Partial<Activity>;return typeof item.id==='string'&&typeof item.text==='string'&&typeof item.detail==='string'&&typeof item.source==='string'&&typeof item.timestamp==='string'&&typeof item.planVersion==='number';}
