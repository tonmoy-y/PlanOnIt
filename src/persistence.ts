import { initialPlan } from './data';
import { Activity, AppState, Plan } from './types';
import { planSchema } from './validation';

const STORAGE_KEY='planonit.state.v2';
export function loadState():AppState{
  if(typeof localStorage==='undefined')return {plan:initialPlan(),activity:[]};
  try{
    const raw=localStorage.getItem(STORAGE_KEY); if(!raw)return {plan:initialPlan(),activity:[]};
    const parsed:unknown=JSON.parse(raw); if(!parsed||typeof parsed!=='object')throw new Error('Invalid state');
    const record=parsed as {plan?:unknown;activity?:unknown}; const plan=planSchema.safeParse(record.plan); if(!plan.success)throw new Error('Invalid plan');
    const activity=Array.isArray(record.activity)?record.activity.filter(isActivity).slice(0,20):[];
    return {plan:plan.data,activity};
  }catch{return {plan:initialPlan(),activity:[]};}
}
export function saveState(plan:Plan,activity:Activity[]){if(typeof localStorage!=='undefined')localStorage.setItem(STORAGE_KEY,JSON.stringify({plan,activity:activity.slice(0,20)}));}
function isActivity(value:unknown):value is Activity{if(!value||typeof value!=='object')return false;const item=value as Partial<Activity>;return typeof item.id==='string'&&typeof item.text==='string'&&typeof item.detail==='string'&&typeof item.source==='string'&&typeof item.timestamp==='string'&&typeof item.planVersion==='number';}
