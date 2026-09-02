export type Tab = 'goal' | 'explore' | 'plan' | 'activity';
export type PlanStatus = 'draft' | 'valid' | 'approved' | 'reservation_pending' | 'reservation_failed' | 'reserved';
export type ActivitySource = 'human' | 'external-agent' | 'quick-planner' | 'system';

export interface Preferences {
  cuisine?: string;
  movieGenre?: string;
  minRestaurantRating?: number;
  transport: 'lowest_cost' | 'comfortable' | 'fastest';
  priority: 'balanced' | 'lowest_cost' | 'highest_rated';
  timing: 'relaxed' | 'compact';
}

export interface Location { id: string; name: string; area: string; city: string; }
export type InventoryState = 'available' | 'held_by_current_plan' | 'committed_to_current_plan' | 'unavailable';
export interface RestaurantSlot { date: string; time: string; capacityRemaining: number; inventoryState?: InventoryState; committedQuantity?: number; }
export interface Restaurant {
  id: string; name: string; cuisine: string; city: string; locationId: string; rating: number;
  pricePerPerson: number; priceRangeMin: number; priceRangeMax: number;
  description: string; image: string; openingHours: string; opensAt: string; closesAt: string;
  minParty: number; maxParty: number; slots: RestaurantSlot[];
}
export interface Cinema { id: string; name: string; city: string; locationId: string; }
export interface Movie { id: string; title: string; genre: string; durationMinutes: number; rating: number; poster: string; description: string; }
export interface Showtime { id: string; movieId: string; cinemaId: string; date: string; startTime: string; price: number; capacity: number; seatsRemaining: number; inventoryState?: InventoryState; committedQuantity?: number; }
export interface TransportOption { id: string; name: string; kind: 'economy' | 'comfort' | 'metro'; durationMinutes: number; fare: number; description: string; }
export interface Route { id: string; fromLocationId: string; toLocationId: string; distanceKm: number; options: TransportOption[]; }

export interface PlanSelections {
  restaurantId?: string; restaurantSlot?: string; movieId?: string; showtimeId?: string; transportOptionId?: string;
}
export interface Approval { version: number; providerRevision: number; approvedAt: string; }
export interface ReservationInventoryRecord { kind:'restaurant'|'showtime'; inventoryKey:string; quantity:number; state:'held'|'committed'|'released'; }
export interface Reservation {
  id: string; planId:string; version: number; providerRevision:number;
  status: 'pending'|'confirmed'|'failed'; reservedAt: string; idempotencyKey: string;
  /** Content-bound hash of the complete reservation intent. Replay requires an exact match. */
  fingerprint: string;
  inventory: ReservationInventoryRecord[]; failureCode?:string;
}
/** The complete, canonicalised description of what a reservation commits to. */
export interface ReservationIntent {
  planId:string; planVersion:number; date:string; people:number;
  restaurantId:string|null; restaurantSlot:string|null; restaurantInventoryKey:string|null;
  movieId:string|null; showtimeId:string|null; showtimeInventoryKey:string|null;
  showtimeStartTime:string|null; transportOptionId:string|null;
}
export interface Plan {
  id: string; version: number; city: string; date: string; people: number; budget: number;
  preferences: Preferences; dinnerDurationMinutes: number; bufferMinutes: number;
  selections: PlanSelections; status: PlanStatus; updatedAt: string; changeSummary: string;
  approval?: Approval; reservation?: Reservation;
}

export interface FeasibilityCheck { id: string; label: string; passed: boolean; blocking: boolean; message: string; }
export interface CostBreakdown { restaurant: number | null; movie: number | null; transport: number | null; total: number | null; remainingBudget: number | null; }
/** Chronological order of the evening: movie → travel → dinner. */
export interface Timeline { movieStart: string; movieEnd: string; departAt: string; arriveAt: string; readyAt: string; dinnerStart: string; dinnerEnd: string; slackMinutes: number; }
export interface PlanEvaluation { valid: boolean; providerRevision: number; checks: FeasibilityCheck[]; costs: CostBreakdown; timeline: Timeline | null; }
export interface PlanSnapshot {
  plan: Plan; evaluation: PlanEvaluation; restaurant: Restaurant | null; movie: Movie | null;
  showtime: Showtime | null; cinema: Cinema | null; route: Route | null; transport: TransportOption | null;
}
export interface Activity { id: string; text: string; detail: string; source: ActivitySource; timestamp: string; planVersion: number; }
export interface ProviderState {
  revision: number;
  restaurantCapacity: Record<string, number>;
  showtimeSeats: Record<string, number>;
  reservations: Record<string, Reservation>;
}
export interface AppState { plan: Plan; activity: Activity[]; provider?: ProviderState; writerId?: string; }

export interface ToolContext { planVersion:number; providerRevision:number; }
export interface ToolError { code: string; message: string; field?: string; retryable: boolean; details?: string[]; context?:Partial<ToolContext>; }
export type ToolResult<T> = { ok: true; data: T } | { ok: false; error: ToolError };
export interface PlannerSuccess { ok: true; plan: Plan; evaluation: PlanEvaluation; considered: number; explanation: string[]; }
export interface PlannerFailure { ok: false; error: ToolError; closest?: Array<{ restaurantId: string; showtimeId: string; failedChecks: string[] }>; }
export type PlannerResult = PlannerSuccess | PlannerFailure;
