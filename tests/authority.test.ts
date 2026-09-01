import { describe, expect, it } from 'vitest';
import { LocalReservationAuthority, RemoteReservationAuthority, resolveAuthority } from '../src/authority';
import { approvePlan, reservePlan, solvePlan } from '../src/domain';
import { defaultPreferences } from '../src/data';
import { MutableDemoProvider } from '../src/providers';
import { Plan, ProviderState, Reservation } from '../src/types';

const constraints={city:'Dhaka' as const,date:'2026-09-04',people:3,budget:5000,preferences:defaultPreferences(),dinnerDurationMinutes:75,bufferMinutes:15};
const approvedPlan=(provider:MutableDemoProvider)=>{const solved=solvePlan(constraints,0,undefined,provider);if(!solved.ok)throw new Error('solve failed');const approved=approvePlan(solved.plan,solved.plan.version,provider);if(!approved.ok)throw new Error('approval failed');return approved.data.plan;};
const respond=(status:number,body:unknown)=>({ok:status<400,status,json:async()=>body}) as unknown as Response;

describe('reservation authority boundary',()=>{
  it('defaults to the local sandbox authority so verified behavior is unchanged',async()=>{
    const provider=new MutableDemoProvider();const plan=approvedPlan(provider);
    expect(resolveAuthority(provider).kind).toBe('local');
    const result=await reservePlan(plan,plan.version,provider);
    expect(result.ok).toBe(true);
    expect(provider.revision).toBe(1);
  });
  it('selects the remote authority only when an endpoint is configured',()=>{
    const provider=new MutableDemoProvider();
    expect(resolveAuthority(provider,{}).kind).toBe('local');
    expect(resolveAuthority(provider,{endpoint:'/api/reserve'}).kind).toBe('remote');
  });
  it('commits through the server and imports the authoritative provider state',async()=>{
    const provider=new MutableDemoProvider();const plan=approvedPlan(provider);
    const serverState:ProviderState={revision:41,restaurantCapacity:{'server|key':1},showtimeSeats:{'server-show':2},reservations:{}};
    const reservation:Reservation={id:'SRV-1',planId:plan.id,version:plan.version,providerRevision:41,status:'confirmed',reservedAt:new Date().toISOString(),idempotencyKey:`${plan.id}:v${plan.version}`,inventory:[]};
    let sent:{url:string;body:unknown;auth:string|undefined}|undefined;
    const authority=new RemoteReservationAuthority({endpoint:'https://example.test/api/reserve',token:'secret',fetchImpl:(async(url,init)=>{
      sent={url:String(url),body:JSON.parse(String((init as RequestInit).body)),auth:new Headers((init as RequestInit).headers).get('authorization')??undefined};
      return respond(201,{ok:true,reservation,idempotent:false,providerState:serverState});
    }) as typeof fetch});
    const result=await reservePlan(plan,plan.version,provider,undefined,authority);
    expect(result.ok).toBe(true);
    if(!result.ok)return;
    expect(result.data.reservationId).toBe('SRV-1');
    expect(sent?.auth).toBe('Bearer secret');
    expect(sent?.body).toMatchObject({planId:plan.id,version:plan.version,idempotencyKey:`${plan.id}:v${plan.version}`});
    expect(provider.exportState()).toEqual(serverState);
    expect(provider.revision).toBe(41);
  });
  it('never commits local inventory when the server refuses',async()=>{
    const provider=new MutableDemoProvider();const plan=approvedPlan(provider);
    const before=provider.exportState();
    const authority=new RemoteReservationAuthority({endpoint:'https://example.test/api/reserve',fetchImpl:(async()=>respond(409,{ok:false,error:{code:'PROVIDER_CONFLICT',message:'Authoritative inventory changed.'}})) as typeof fetch});
    const result=await reservePlan(plan,plan.version,provider,undefined,authority);
    expect(result.ok).toBe(false);
    if(result.ok)return;
    expect(result.error.code).toBe('PROVIDER_CONFLICT');
    expect(result.plan?.status).toBe('reservation_failed');
    expect(provider.exportState()).toEqual(before);
  });
  it('fails closed when the authority is unreachable or malformed',async()=>{
    const provider=new MutableDemoProvider();const plan=approvedPlan(provider);
    const unreachable=new RemoteReservationAuthority({endpoint:'https://example.test/api/reserve',fetchImpl:(async()=>{throw new Error('network down');}) as typeof fetch});
    const down=await reservePlan(plan,plan.version,provider,undefined,unreachable);
    expect(down.ok).toBe(false);
    if(!down.ok)expect(down.error.code).toBe('AUTHORITY_UNREACHABLE');
    const malformed=new RemoteReservationAuthority({endpoint:'https://example.test/api/reserve',fetchImpl:(async()=>respond(200,{ok:true})) as typeof fetch});
    const bad=await reservePlan(plan,plan.version,provider,undefined,malformed);
    expect(bad.ok).toBe(false);
    if(!bad.ok)expect(bad.error.code).toBe('AUTHORITY_MALFORMED_RESPONSE');
    expect(provider.revision).toBe(0);
  });
  it('discards an authoritative provider state that fails schema validation',async()=>{
    const provider=new MutableDemoProvider();const plan=approvedPlan(provider);
    const reservation:Reservation={id:'SRV-2',planId:plan.id,version:plan.version,providerRevision:1,status:'confirmed',reservedAt:new Date().toISOString(),idempotencyKey:`${plan.id}:v${plan.version}`,inventory:[]};
    const authority=new RemoteReservationAuthority({endpoint:'https://example.test/api/reserve',fetchImpl:(async()=>respond(201,{ok:true,reservation,providerState:{revision:-4,restaurantCapacity:'nope'}})) as typeof fetch});
    const result=await reservePlan(plan,plan.version,provider,undefined,authority);
    expect(result.ok).toBe(true);
    expect(provider.exportState().revision).toBe(0);
  });
  it('keeps the local authority idempotent for a repeated commitment',async()=>{
    const provider=new MutableDemoProvider();const plan:Plan=approvedPlan(provider);
    const authority=new LocalReservationAuthority(provider);
    const first=await authority.commit(plan);
    const second=await authority.commit(plan);
    expect(first.ok&&second.ok).toBe(true);
    if(!first.ok||!second.ok)return;
    expect(second.data.idempotent).toBe(true);
    expect(second.data.reservation.id).toBe(first.data.reservation.id);
    expect(provider.revision).toBe(1);
  });
});
