import { cinemas, locations, movies, restaurants, routes, showtimes } from './data';
import { Restaurant, Route, Showtime } from './types';

export const getLocation = (id?:string) => locations.find(item=>item.id===id);
export const getRestaurant = (id?:string) => restaurants.find(item=>item.id===id);
export const getMovie = (id?:string) => movies.find(item=>item.id===id);
export const getCinema = (id?:string) => cinemas.find(item=>item.id===id);
export const getShowtime = (id?:string) => showtimes.find(item=>item.id===id);
export const getRoute = (from?:string,to?:string) => routes.find(item=>item.fromLocationId===from&&item.toLocationId===to);
export const getTransportOption = (route:Route|undefined,id?:string) => route?.options.find(item=>item.id===id);

export function availableRestaurantSlots(restaurant:Restaurant,date:string,people:number){
  return restaurant.slots.filter(slot=>slot.date===date&&slot.capacityRemaining>=people&&people>=restaurant.minParty&&people<=restaurant.maxParty);
}
export function searchRestaurantInventory(input:{city:string;date:string;people:number;cuisine?:string;minRating?:number;maxPricePerPerson?:number}){
  return restaurants.filter(restaurant=>restaurant.city===input.city
    &&(!input.cuisine||restaurant.cuisine.toLowerCase().includes(input.cuisine.toLowerCase()))
    &&(!input.minRating||restaurant.rating>=input.minRating)
    &&(!input.maxPricePerPerson||restaurant.pricePerPerson<=input.maxPricePerPerson)
    &&availableRestaurantSlots(restaurant,input.date,input.people).length>0);
}
export function searchShowtimeInventory(input:{city:string;date:string;people:number;genre?:string}){
  return showtimes.filter(showtime=>showtime.date===input.date&&showtime.seatsRemaining>=input.people).filter(showtime=>{
    const movie=getMovie(showtime.movieId); const cinema=getCinema(showtime.cinemaId);
    return Boolean(movie&&cinema?.city===input.city&&(!input.genre||movie.genre.toLowerCase().includes(input.genre.toLowerCase())));
  });
}
export function routeInventory(fromLocationId:string,toLocationId:string):Route|undefined{return getRoute(fromLocationId,toLocationId);}
export function showtimeDetails(showtime:Showtime){return {showtime,movie:getMovie(showtime.movieId),cinema:getCinema(showtime.cinemaId)};}
