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
