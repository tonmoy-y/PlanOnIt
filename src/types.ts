export type Tab = 'overview' | 'explore' | 'plan';
export type Service = 'restaurant' | 'movie' | 'transport';
export interface Restaurant { id: string; name: string; cuisine: string; area: string; city: string; rating: number; pricePerPerson: number; description: string; image: string; }
export interface Movie { id: string; title: string; genre: string; duration: number; rating: number; cinema: string; poster: string; showtimes: Showtime[]; }
export interface Showtime { id: string; date: string; time: string; price: number; seats: number; }
export interface Ride { id: string; name: string; from: string; to: string; eta: string; fare: number; comfort: string; }
export interface Plan { city: string; date: string; people: number; budget: number; preferences: string; restaurantId?: string; movieId?: string; showtimeId?: string; rideId?: string; approved: boolean; }
export interface Activity { id: string; text: string; detail: string; type: 'agent' | 'human' | 'system'; time: string; }
