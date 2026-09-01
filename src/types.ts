export type Tab = 'overview' | 'explore' | 'plan';
export type PlanStatus = 'draft' | 'valid' | 'approved' | 'reserved';
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
export interface RestaurantSlot { date: string; time: string; capacityRemaining: number; }
export interface Restaurant {
  id: string; name: string; cuisine: string; city: string; locationId: string; rating: number;
  pricePerPerson: number; description: string; image: string; openingHours: string;
  minParty: number; maxParty: number; slots: RestaurantSlot[];
}
export interface Cinema { id: string; name: string; city: string; locationId: string; }
export interface Movie { id: string; title: string; genre: string; durationMinutes: number; rating: number; poster: string; description: string; }
export interface Showtime { id: string; movieId: string; cinemaId: string; date: string; startTime: string; price: number; capacity: number; seatsRemaining: number; }
export interface TransportOption { id: string; name: string; kind: 'economy' | 'comfort' | 'metro'; durationMinutes: number; fare: number; description: string; }
export interface Route { id: string; fromLocationId: string; toLocationId: string; distanceKm: number; options: TransportOption[]; }

export interface PlanSelections {
  restaurantId?: string; restaurantSlot?: string; movieId?: string; showtimeId?: string; transportOptionId?: string;
}
export interface Approval { version: number; approvedAt: string; }
export interface Reservation { id: string; version: number; status: 'simulated_confirmed'; reservedAt: string; }
export interface Plan {
  id: string; version: number; city: string; date: string; people: number; budget: number;
  preferences: Preferences; dinnerDurationMinutes: number; bufferMinutes: number;
  selections: PlanSelections; status: PlanStatus; updatedAt: string; changeSummary: string;
  approval?: Approval; reservation?: Reservation;
}

export interface FeasibilityCheck { id: string; label: string; passed: boolean; blocking: boolean; message: string; }
export interface CostBreakdown { restaurant: number | null; movie: number | null; transport: number | null; total: number | null; remainingBudget: number | null; }
export interface Timeline { dinnerStart: string; dinnerEnd: string; departAt: string; arriveAt: string; movieStart: string; movieEnd: string; slackMinutes: number; }
export interface PlanEvaluation { valid: boolean; checks: FeasibilityCheck[]; costs: CostBreakdown; timeline: Timeline | null; }
export interface PlanSnapshot {
  plan: Plan; evaluation: PlanEvaluation; restaurant: Restaurant | null; movie: Movie | null;
  showtime: Showtime | null; cinema: Cinema | null; route: Route | null; transport: TransportOption | null;
}
export interface Activity { id: string; text: string; detail: string; source: ActivitySource; timestamp: string; planVersion: number; }
export interface AppState { plan: Plan; activity: Activity[]; }

export interface ToolError { code: string; message: string; field?: string; retryable: boolean; details?: string[]; }
export type ToolResult<T> = { ok: true; data: T } | { ok: false; error: ToolError };
export interface PlannerSuccess { ok: true; plan: Plan; evaluation: PlanEvaluation; considered: number; explanation: string[]; }
export interface PlannerFailure { ok: false; error: ToolError; closest?: Array<{ restaurantId: string; showtimeId: string; failedChecks: string[] }>; }
export type PlannerResult = PlannerSuccess | PlannerFailure;
