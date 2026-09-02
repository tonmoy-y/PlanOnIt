import { getStore } from '@netlify/blobs';

/**
 * Server-authoritative reservation transaction.
 *
 * Concurrency: the ledger is read with its etag and written with a conditional
 * `onlyIfMatch`, so two simultaneous commitments cannot both succeed — the loser gets
 * AUTHORITY_REVISION_CONFLICT. This is a compare-and-swap, not a read-then-write.
 *
 * Authentication: a bearer token is required. A public browser bundle cannot hold a secret,
 * so this endpoint is reachable only by trusted server-side callers. It is intentionally NOT
 * enabled for the deployed browser app.
 *
 * The browser may lie about capacity, forge an approval, or replay a confirmation.
 * This function is the only thing that can actually commit inventory: it re-reads the
 * canonical ledger, re-checks capacity, enforces a content-bound idempotency key, bumps the
 * revision, and returns the canonical provider state for every client to import.
 *
 * STATUS: NOT ENABLED IN PRODUCTION, DELIBERATELY.
 * Two honest limitations block it, and neither is papered over:
 *   1. Authentication. A public single-page client cannot hold a shared bearer secret without
 *      publishing it in JavaScript. Until a real per-user session exists, enabling this would
 *      be authentication theatre, so `VITE_PLANONIT_AUTHORITY_ENDPOINT` is left unset and the
 *      verified in-browser authority remains the only active one.
 *   2. Atomicity. `getStore().get()` followed by `set()` is a read-modify-write, not a
 *      transaction. Two simultaneous commits can interleave. It is written to fail closed and
 *      to be idempotent, but it is not claimed to be transactional anywhere in the docs.
 */
const STORE='planonit-workspace';
const LEDGER='provider-state';
const EMPTY={revision:0,restaurantCapacity:{},showtimeSeats:{},reservations:{}};
const json=(status,body)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json','cache-control':'no-store'}});
const unauthorized=()=>json(401,{ok:false,error:{code:'UNAUTHENTICATED',message:'A workspace token is required to commit inventory.'}});

export default async function handler(request){
  if(request.method!=='POST')return json(405,{ok:false,error:{code:'METHOD_NOT_ALLOWED',message:'Use POST.'}});
  const expected=process.env.PLANONIT_WORKSPACE_TOKEN;
  if(!expected)return json(500,{ok:false,error:{code:'AUTHORITY_MISCONFIGURED',message:'PLANONIT_WORKSPACE_TOKEN is not set.'}});
  const presented=(request.headers.get('authorization')??'').replace(/^Bearer\s+/i,'');
  if(presented!==expected)return unauthorized();

  let body;
  try{body=await request.json();}catch{return json(400,{ok:false,error:{code:'INVALID_INPUT',message:'Body must be JSON.'}});}
  const {planId,version,date,people,selections,fingerprint,idempotencyKey}=body??{};
  if(typeof planId!=='string'||!Number.isInteger(version)||version<1||typeof date!=='string'||!Number.isInteger(people)||people<1||people>12||!selections||typeof idempotencyKey!=='string')
    return json(400,{ok:false,error:{code:'INVALID_INPUT',message:'planId, version, date, people, selections and idempotencyKey are required.'}});
  if(typeof fingerprint!=='string'||fingerprint.length<4||idempotencyKey!==fingerprint)
    return json(400,{ok:false,error:{code:'IDEMPOTENCY_KEY_MISMATCH',message:'The idempotency key must be the content-bound reservation fingerprint.'}});

  const store=getStore(STORE);
  // Read with the etag so the write below can be a genuine compare-and-swap rather than a
  // read-then-write that silently loses a concurrent commitment.
  const snapshot=await store.getWithMetadata(LEDGER,{type:'json'});
  const state=snapshot?.data??EMPTY;
  const etag=snapshot?.etag;

  // Identity keys the ledger; the fingerprint decides whether a repeat is a replay or a
  // different reservation wearing the same key.
  const ledgerKey=`${planId}:v${version}`;
  const existing=state.reservations[ledgerKey];
  if(existing&&existing.fingerprint!==fingerprint)
    return json(409,{ok:false,error:{code:'RESERVATION_INTENT_MISMATCH',message:'A reservation already exists for this plan version with different selections.'}});
  if(existing)return json(200,{ok:true,reservation:existing,idempotent:true,providerState:state});

  const tableKey=`${selections.restaurantId}|${date}|${selections.restaurantSlot}`;
  const seatKey=selections.showtimeId;
  const tableRemaining=state.restaurantCapacity[tableKey];
  const seatsRemaining=state.showtimeSeats[seatKey];
  if(tableRemaining===undefined||seatsRemaining===undefined)
    return json(409,{ok:false,error:{code:'AUTHORITY_LEDGER_UNSEEDED',message:'This inventory key is not present in the authoritative ledger. Seed the ledger before reserving.'}});
  if(tableRemaining<people||seatsRemaining<people)
    return json(409,{ok:false,error:{code:'PROVIDER_CONFLICT',message:'Authoritative inventory changed. Refresh and repair the plan before approving again.'}});

  const reservation={
    id:`SBX-${planId.toUpperCase()}-V${version}`,planId,version,providerRevision:state.revision+1,
    status:'confirmed',reservedAt:new Date().toISOString(),idempotencyKey,fingerprint,
    inventory:[
      {kind:'restaurant',inventoryKey:tableKey,quantity:people,state:'committed'},
      {kind:'showtime',inventoryKey:seatKey,quantity:people,state:'committed'},
    ],
  };
  const next={
    revision:state.revision+1,
    restaurantCapacity:{...state.restaurantCapacity,[tableKey]:tableRemaining-people},
    showtimeSeats:{...state.showtimeSeats,[seatKey]:seatsRemaining-people},
    reservations:{...state.reservations,[ledgerKey]:reservation},
  };
  // Conditional write: the store rejects the update unless the ledger is still exactly the
  // revision this transaction read. `modified === false` means another commitment won the race.
  const written=etag
    ? await store.setJSON(LEDGER,next,{onlyIfMatch:etag})
    : await store.setJSON(LEDGER,next,{onlyIfNew:true});
  if(written&&written.modified===false)
    return json(409,{ok:false,error:{code:'AUTHORITY_REVISION_CONFLICT',message:'The authoritative ledger changed during this transaction. Retry against the current revision.'}});
  return json(201,{ok:true,reservation,idempotent:false,providerState:next});
}

export const config={path:'/api/reserve'};
