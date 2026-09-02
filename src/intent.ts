import { Plan, ReservationIntent, Restaurant, Showtime } from './types';

/**
 * Content-bound reservation identity.
 *
 * `planId:version` alone is content-blind: a forged or replayed plan can reuse the same
 * key with different selections. Everything that uniquely identifies what the provider is
 * asked to commit is canonicalised here and hashed, so an identical intent replays
 * idempotently and any changed intent (restaurant, movie, showtime, date, party size,
 * or provider inventory key) is a different reservation.
 */
export interface IntentLookup {
  getRestaurant(id?:string):Restaurant|undefined;
  getShowtime(id?:string):Showtime|undefined;
}

export const restaurantInventoryKey=(restaurantId:string,date:string,time:string)=>`${restaurantId}|${date}|${time}`;

export function reservationIntent(plan:Plan,lookup:IntentLookup):ReservationIntent{
  const restaurant=lookup.getRestaurant(plan.selections.restaurantId);
  const showtime=lookup.getShowtime(plan.selections.showtimeId);
  const slot=plan.selections.restaurantSlot??null;
  return {
    planId:plan.id,
    planVersion:plan.version,
    date:plan.date,
    people:plan.people,
    restaurantId:restaurant?.id??null,
    restaurantSlot:slot,
    restaurantInventoryKey:restaurant&&slot?restaurantInventoryKey(restaurant.id,plan.date,slot):null,
    movieId:plan.selections.movieId??null,
    showtimeId:showtime?.id??null,
    showtimeInventoryKey:showtime?showtime.id:null,
    showtimeStartTime:showtime?.startTime??null,
    transportOptionId:plan.selections.transportOptionId??null,
  };
}

/** Deterministic canonical form: keys sorted, no whitespace, no undefined. */
export function canonicalise(value:unknown):string{
  if(value===null||value===undefined)return 'null';
  if(Array.isArray(value))return `[${value.map(canonicalise).join(',')}]`;
  if(typeof value==='object'){
    const record=value as Record<string,unknown>;
    return `{${Object.keys(record).sort().map(key=>`${JSON.stringify(key)}:${canonicalise(record[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/** FNV-1a, widened with the canonical length so short collisions are practically impossible. */
function hash(input:string):string{
  let hashValue=0x811c9dc5;
  for(let index=0;index<input.length;index++){hashValue^=input.charCodeAt(index);hashValue=Math.imul(hashValue,0x01000193)>>>0;}
  let second=0x9e3779b1;
  for(let index=input.length-1;index>=0;index--){second^=input.charCodeAt(index);second=Math.imul(second,0x85ebca6b)>>>0;}
  return `${hashValue.toString(16).padStart(8,'0')}${second.toString(16).padStart(8,'0')}${input.length.toString(16)}`;
}

export function reservationFingerprint(plan:Plan,lookup:IntentLookup):string{
  return `fp1_${hash(canonicalise(reservationIntent(plan,lookup)))}`;
}

/** Identity key for the provider ledger. Content equality is enforced by the fingerprint. */
export const reservationLedgerKey=(plan:Pick<Plan,'id'|'version'>)=>`${plan.id}:v${plan.version}`;
