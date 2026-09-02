import { InventoryProvider } from './providers';
import { Plan, ProviderState, Reservation, ToolResult } from './types';
import { fail, ok, providerStateSchema } from './validation';

/**
 * The reservation transaction boundary.
 *
 * Reads (browsing inventory) stay local and synchronous. The single consequential
 * write — committing table and seat inventory — goes through this interface, so an
 * authoritative server can own capacity, idempotency, and provider revisions without
 * rewriting the solver, the WebMCP tools, or the human UI.
 */
export interface ReservationAuthority {
  readonly kind:'local'|'remote';
  commit(plan:Plan):Promise<ToolResult<{reservation:Reservation;idempotent:boolean;providerState?:ProviderState}>>;
}

/** Default: the in-browser sandbox provider is its own authority. */
export class LocalReservationAuthority implements ReservationAuthority {
  readonly kind='local' as const;
  constructor(private readonly provider:InventoryProvider){}
  async commit(plan:Plan){return this.provider.reserve(plan);}
}

export interface RemoteAuthorityOptions {endpoint:string;token?:string;fetchImpl?:typeof fetch;timeoutMs?:number;}

/**
 * Authenticated server-authoritative reservations.
 *
 * The server owns the inventory ledger, the idempotency key, and the provider revision.
 * A client that lies about capacity, forges an approval, or replays a confirmation cannot
 * change the outcome: the server re-checks capacity and returns the canonical provider
 * state, which the client imports so every tab converges on the server's revision.
 */
export class RemoteReservationAuthority implements ReservationAuthority {
  readonly kind='remote' as const;
  constructor(private readonly options:RemoteAuthorityOptions){}
  async commit(plan:Plan):Promise<ToolResult<{reservation:Reservation;idempotent:boolean;providerState?:ProviderState}>>{
    const request=this.options.fetchImpl??globalThis.fetch;
    if(typeof request!=='function')return fail('AUTHORITY_UNAVAILABLE','No fetch implementation is available for the remote reservation authority.',undefined,true);
    const controller=typeof AbortController==='function'?new AbortController():undefined;
    const timer=controller&&typeof setTimeout==='function'?setTimeout(()=>controller.abort(),this.options.timeoutMs??8000):undefined;
    try{
      const response=await request(this.options.endpoint,{
        method:'POST',
        headers:{'content-type':'application/json',...(this.options.token?{authorization:`Bearer ${this.options.token}`}:{})},
        // The idempotency key is the content-bound fingerprint captured for this exact intent,
        // so the server can never replay a commitment against different selections.
        body:JSON.stringify({planId:plan.id,version:plan.version,date:plan.date,people:plan.people,selections:plan.selections,fingerprint:plan.reservation?.fingerprint,idempotencyKey:plan.reservation?.fingerprint??`${plan.id}:v${plan.version}`}),
        signal:controller?.signal,
      });
      const payload=await response.json().catch(()=>null) as {ok?:boolean;error?:{code?:string;message?:string};reservation?:Reservation;idempotent?:boolean;providerState?:unknown}|null;
      if(!response.ok||!payload)return fail(payload?.error?.code??`AUTHORITY_HTTP_${response.status}`,payload?.error?.message??'The reservation authority rejected the request.',undefined,response.status>=500||response.status===409);
      if(payload.ok===false)return fail(payload.error?.code??'AUTHORITY_REJECTED',payload.error?.message??'The reservation authority refused this commitment.',undefined,true);
      if(!payload.reservation)return fail('AUTHORITY_MALFORMED_RESPONSE','The reservation authority returned no reservation record.',undefined,true);
      const providerState=providerStateSchema.safeParse(payload.providerState);
      return ok({reservation:payload.reservation,idempotent:Boolean(payload.idempotent),providerState:providerState.success?providerState.data:undefined});
    }catch(error){
      return fail('AUTHORITY_UNREACHABLE',`The reservation authority could not be reached: ${error instanceof Error?error.message:'unknown error'}.`,undefined,true);
    }finally{if(timer!==undefined)clearTimeout(timer);}
  }
}

/**
 * Chooses the authority for this build. Remote authority is opt-in and only becomes active
 * when an endpoint is configured, so an unconfigured deployment keeps the verified local behavior.
 */
export function resolveAuthority(provider:InventoryProvider,env:{endpoint?:string;token?:string}={}):ReservationAuthority{
  return env.endpoint?new RemoteReservationAuthority({endpoint:env.endpoint,token:env.token}):new LocalReservationAuthority(provider);
}
