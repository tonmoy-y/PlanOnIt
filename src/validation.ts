import { z } from 'zod';
import { ToolResult } from './types';

export const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/,'Must use YYYY-MM-DD').refine(value=>{
  const [year,month,day]=value.split('-').map(Number);
  const candidate=new Date(Date.UTC(year,month-1,day));
  return candidate.getUTCFullYear()===year&&candidate.getUTCMonth()===month-1&&candidate.getUTCDate()===day;
},'Invalid calendar date');
export const PLANNING_WINDOW={start:'2026-09-03',end:'2026-09-16'} as const;
export const planningDateSchema=dateSchema.refine(value=>value>=PLANNING_WINDOW.start&&value<=PLANNING_WINDOW.end,`Date must be between ${PLANNING_WINDOW.start} and ${PLANNING_WINDOW.end}`);
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/,'Must use 24-hour HH:mm');
const city = z.literal('Dhaka',{error:'Only Dhaka is available in this demo'});
const people = z.number().int('People must be a whole number').min(1,'At least 1 person is required').max(12,'This sandbox supports at most 12 people');
const budget = z.number().int('Budget must be a whole number').min(500,'Budget must be at least ৳500').max(100000,'Budget cannot exceed ৳100,000');
export const preferencesSchema = z.object({
  cuisine:z.string().min(2).max(40).optional(), movieGenre:z.string().min(2).max(40).optional(),
  minRestaurantRating:z.number().min(1).max(5).optional(),
  transport:z.enum(['lowest_cost','comfortable','fastest']).default('lowest_cost'),
  priority:z.enum(['balanced','lowest_cost','highest_rated']).default('balanced'),
  timing:z.enum(['relaxed','compact']).default('relaxed')
}).strict();
export const planSchema=z.object({
  id:z.string(),version:z.number().int().positive(),city,date:planningDateSchema,people,budget,preferences:preferencesSchema,
  dinnerDurationMinutes:z.number().int().min(45).max(150),bufferMinutes:z.number().int().min(5).max(45),
  selections:z.object({restaurantId:z.string().optional(),restaurantSlot:time.optional(),movieId:z.string().optional(),showtimeId:z.string().optional(),transportOptionId:z.string().optional()}).strict(),
  status:z.enum(['draft','valid','approved','reservation_pending','reservation_failed','reserved']),updatedAt:z.string(),changeSummary:z.string(),
  approval:z.object({version:z.number().int().positive(),providerRevision:z.number().int().nonnegative(),approvedAt:z.string()}).strict().optional(),
  reservation:z.object({id:z.string(),planId:z.string(),version:z.number().int().positive(),providerRevision:z.number().int().nonnegative(),status:z.enum(['pending','confirmed','failed']),reservedAt:z.string(),idempotencyKey:z.string(),fingerprint:z.string().min(4),inventory:z.array(z.object({kind:z.enum(['restaurant','showtime']),inventoryKey:z.string(),quantity:z.number().int().positive(),state:z.enum(['held','committed','released'])}).strict()),failureCode:z.string().optional()}).strict().optional()
}).strict();
const reservationSchema=planSchema.shape.reservation.unwrap();
export const providerStateSchema=z.object({revision:z.number().int().nonnegative(),restaurantCapacity:z.record(z.string(),z.number().int().nonnegative()),showtimeSeats:z.record(z.string(),z.number().int().nonnegative()),reservations:z.record(z.string(),reservationSchema)}).strict();

export const emptyInputSchema=z.object({}).strict();
export const searchRestaurantsSchema=z.object({city,date:planningDateSchema,people,cuisine:z.string().min(2).max(40).optional(),minRating:z.number().min(1).max(5).optional(),maxPricePerPerson:z.number().int().min(100).max(10000).optional()}).strict();
export const restaurantDetailsSchema=z.object({restaurantId:z.string().min(1)}).strict();
export const availabilitySchema=z.object({restaurantId:z.string().min(1),date:planningDateSchema,people}).strict();
export const showtimesSchema=z.object({city,date:planningDateSchema,people,genre:z.string().min(2).max(40).optional()}).strict();
export const transportSchema=z.object({fromLocationId:z.string().min(1),toLocationId:z.string().min(1)}).strict();
export const createPlanSchema=z.object({city,date:planningDateSchema,people,budget,preferences:preferencesSchema,dinnerDurationMinutes:z.number().int().min(45).max(150).default(75),bufferMinutes:z.number().int().min(5).max(45).default(15)}).strict();
export const constraintsSchema=z.object({city,date:planningDateSchema,people,budget}).strict();
export const updatePlanSchema=z.object({
  expectedVersion:z.number().int().positive(), restaurantId:z.string().min(1).optional(), restaurantSlot:time.optional(),
  movieId:z.string().min(1).optional(), showtimeId:z.string().min(1).optional(), transportOptionId:z.string().min(1).optional(),
  budget:budget.optional(), people:people.optional(), preferences:preferencesSchema.optional()
}).strict().superRefine((value,ctx)=>{
  const changes=Object.keys(value).filter(key=>key!=='expectedVersion');
  if(changes.length===0)ctx.addIssue({code:'custom',message:'At least one change is required'});
  if(Boolean(value.movieId)!==Boolean(value.showtimeId))ctx.addIssue({code:'custom',path:['movieId'],message:'movieId and showtimeId must be updated together'});
  if(Boolean(value.restaurantId)!==Boolean(value.restaurantSlot))ctx.addIssue({code:'custom',path:['restaurantId'],message:'restaurantId and restaurantSlot must be updated together'});
});
export const repairPlanSchema=z.object({expectedVersion:z.number().int().positive(),preserveRestaurant:z.boolean().default(true),preserveMovie:z.boolean().default(false)}).strict();
export const startNewPlanSchema=z.object({expectedVersion:z.number().int().positive(),acknowledgeExistingReservation:z.boolean().default(true)}).strict();
export const reservePlanSchema=z.object({expectedVersion:z.number().int().positive(),confirmation:z.literal('CONFIRM_SIMULATED_RESERVATION')}).strict();

export function validationError(error:z.ZodError):ToolResult<never>{
  const issue=error.issues[0]; const field=issue.path.length?issue.path.join('.'):undefined;
  return {ok:false,error:{code:'INVALID_INPUT',message:issue.message,field,retryable:true,details:error.issues.map(item=>`${item.path.join('.')||'input'}: ${item.message}`)}};
}
export function fail(code:string,message:string,field?:string,retryable=false,details?:string[]):ToolResult<never>{return {ok:false,error:{code,message,field,retryable,details}};}
export function ok<T>(data:T):ToolResult<T>{return {ok:true,data};}
export function parseInput<T>(schema:z.ZodType<T>,input:unknown):ToolResult<T>{const parsed=schema.safeParse(input);return parsed.success?ok(parsed.data):validationError(parsed.error);}
