import { initialPlan, movies, restaurants, rides } from './data';
import { Plan } from './types';
export function getRestaurant(id?: string){ return restaurants.find(x=>x.id===id); }
export function getMovie(id?: string){ return movies.find(x=>x.id===id); }
export function getRide(id?: string){ return rides.find(x=>x.id===id); }
export function getShowtime(movieId?: string, showtimeId?: string){ return getMovie(movieId)?.showtimes.find(x=>x.id===showtimeId); }
export function totalCost(plan: Plan){ return (getRestaurant(plan.restaurantId)?.pricePerPerson ?? 0)*plan.people + (getShowtime(plan.movieId,plan.showtimeId)?.price ?? 0)*plan.people + (getRide(plan.rideId)?.fare ?? 0); }
export function planSnapshot(plan: Plan){ const total=totalCost(plan); return { ...plan, total, remainingBudget: plan.budget-total, budgetStatus: total<=plan.budget?'within_budget':'over_budget', restaurant:getRestaurant(plan.restaurantId)?.name ?? null, movie:getMovie(plan.movieId)?.title ?? null, showtime:getShowtime(plan.movieId,plan.showtimeId)?.time ?? null, ride:getRide(plan.rideId)?.name ?? null }; }
export function makeAgentPlan(input: Partial<Plan>): Plan { const p={...initialPlan,...input}; const restaurant=restaurants.filter(x=>x.city===p.city).sort((a,b)=>b.rating-a.rating).find(x=>x.pricePerPerson*p.people<=(p.budget*.55)) ?? restaurants[0]; const movie=movies.find(x=>x.showtimes.some(s=>s.date===p.date && s.seats>=p.people)) ?? movies[0]; const show=movie.showtimes.find(s=>s.date===p.date && s.seats>=p.people) ?? movie.showtimes[0]; const ride=rides.find(x=>x.fare + restaurant.pricePerPerson*p.people + show.price*p.people <= p.budget) ?? rides[2]; return {...p,restaurantId:restaurant.id,movieId:movie.id,showtimeId:show.id,rideId:ride.id,approved:false}; }
