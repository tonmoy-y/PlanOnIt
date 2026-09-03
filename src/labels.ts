import { FeasibilityCheck, Plan, PlanStatus } from './types';

/**
 * Human-facing vocabulary.
 *
 * The domain keeps stable technical check IDs because WebMCP clients depend on them. People do
 * not: "Reservation ownership: No provider commitment is required before reservation" is an
 * audit line, not an explanation. This module is the one place that translates the system's
 * language into a diner's, so the domain and the tool payloads stay untouched.
 */
export const CHECK_LABELS: Record<string,string> = {
  date_window: 'Date available',
  complete: 'Everything chosen',
  city: 'Same city',
  restaurant_availability: 'Table available',
  showtime_integrity: 'Film and showtime match',
  reservation_integrity: 'Your booking',
  route: 'Getting there',
  chronology: 'Timing works',
  restaurant_hours: 'Restaurant open',
  budget: 'Within budget',
};

export const checkLabel=(check:FeasibilityCheck)=>CHECK_LABELS[check.id]??check.label;

/**
 * Same idea as CHECK_LABELS, for the one other place raw system vocabulary reached the
 * person: a failed reservation's provider error code. The domain and ledger keep the code
 * (WebMCP payloads and the audit trail depend on it); the plan screen shows this instead.
 */
export const FAILURE_LABELS: Record<string,string> = {
  RESERVATION_ABANDONED: 'The previous attempt was interrupted before it finished',
  RESERVATION_INTENT_MISMATCH: 'This evening was already booked with different details',
  PROVIDER_UNAVAILABLE: 'The booking service was briefly unavailable',
  PROVIDER_CONFLICT: 'The table or seats were taken just before this was confirmed',
  AUTHORITY_UNAVAILABLE: 'The booking service was briefly unavailable',
  AUTHORITY_MALFORMED_RESPONSE: 'The booking service sent back an unexpected response',
  AUTHORITY_UNREACHABLE: 'The booking service could not be reached',
  AUTHORITY_REJECTED: 'The booking service declined this reservation',
  AUTHORITY_REVISION_CONFLICT: 'Availability changed at the same moment',
};

export const failureLabel=(code?:string):string=>{
  if(!code)return 'Something interrupted the booking';
  return FAILURE_LABELS[code]??(code.startsWith('AUTHORITY_HTTP_')?'The booking service returned an error':'Something interrupted the booking');
};

/** Short state word for the header strip; the long form stays on the plan page. */
export const STATUS_WORDS: Record<PlanStatus,string> = {
  draft: 'Draft',
  valid: 'Ready for review',
  approved: 'Approved',
  reservation_pending: 'Booking…',
  reservation_failed: 'Booking failed',
  reserved: 'Reserved',
};

/** A plan the person has actually started shaping — anything chosen at all. */
export const planStarted=(plan:Plan)=>Boolean(plan.selections.movieId||plan.selections.showtimeId||plan.selections.restaurantId||plan.selections.transportOptionId);

const WEEKDAYS=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const MONTHS=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

/**
 * `2026-09-05` is a database value. People read `Fri, 5 Sep`. ISO stays in the WebMCP payloads,
 * the date input, and every schema; this is only for prose the person reads.
 */
export function formatPlanDate(isoDate:string):string{
  if(!/^\d{4}-\d{2}-\d{2}$/.test(isoDate))return isoDate;
  const [year,month,day]=isoDate.split('-').map(Number);
  const date=new Date(Date.UTC(year,month-1,day));
  if(Number.isNaN(date.getTime()))return isoDate;
  return `${WEEKDAYS[date.getUTCDay()]}, ${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]}`;
}

export const peopleLabel=(people:number)=>`${people} ${people===1?'person':'people'}`;
