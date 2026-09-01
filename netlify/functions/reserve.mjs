import { getStore } from '@netlify/blobs';

/**
 * Server-authoritative reservation transaction.
 *
 * The browser may lie about capacity, forge an approval, or replay a confirmation.
 * This function is the only thing that can actually commit inventory: it re-reads the
 * canonical ledger, re-checks capacity, enforces the idempotency key, bumps the revision,
 * and returns the canonical provider state for every client to import.
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
  const {planId,version,date,people,selections,idempotencyKey}=body??{};
  if(typeof planId!=='string'||!Number.isInteger(version)||version<1||typeof date!=='string'||!Number.isInteger(people)||people<1||people>12||!selections||typeof idempotencyKey!=='string')
    return json(400,{ok:false,error:{code:'INVALID_INPUT',message:'planId, version, date, people, selections and idempotencyKey are required.'}});
  if(idempotencyKey!==`${planId}:v${version}`)
    return json(400,{ok:false,error:{code:'IDEMPOTENCY_KEY_MISMATCH',message:'The idempotency key must identify the exact plan version.'}});

  const store=getStore(STORE);
  const state=(await store.get(LEDGER,{type:'json'}))??EMPTY;

  const existing=state.reservations[idempotencyKey];
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
    status:'confirmed',reservedAt:new Date().toISOString(),idempotencyKey,
    inventory:[
      {kind:'restaurant',inventoryKey:tableKey,quantity:people,state:'committed'},
      {kind:'showtime',inventoryKey:seatKey,quantity:people,state:'committed'},
    ],
  };
  const next={
    revision:state.revision+1,
    restaurantCapacity:{...state.restaurantCapacity,[tableKey]:tableRemaining-people},
    showtimeSeats:{...state.showtimeSeats,[seatKey]:seatsRemaining-people},
    reservations:{...state.reservations,[idempotencyKey]:reservation},
  };
  // Blobs writes are last-write-wins, so re-read and abort if the ledger moved under us.
  const current=(await store.get(LEDGER,{type:'json'}))??EMPTY;
  if(current.revision!==state.revision)
    return json(409,{ok:false,error:{code:'AUTHORITY_REVISION_CONFLICT',message:'The authoritative ledger changed during this transaction. Retry against the current revision.'}});
  await store.setJSON(LEDGER,next);
  return json(201,{ok:true,reservation,idempotent:false,providerState:next});
}

export const config={path:'/api/reserve'};
