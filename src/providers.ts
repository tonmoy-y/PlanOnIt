import { cinemas, locations, movies, restaurants, routes, showtimes } from './data';
import { reservationFingerprint, reservationLedgerKey } from './intent';
import { InventoryState, Plan, ProviderState, Reservation, Restaurant, RestaurantSlot, Route, Showtime, ToolResult } from './types';
import { fail, ok, PLANNING_WINDOW } from './validation';

const dateInId=/\d{4}-\d{2}-\d{2}/;
const restaurantKey=(restaurantId:string,date:string,time:string)=>`${restaurantId}|${date}|${time}`;
const clone=<T>(value:T):T=>structuredClone(value);

export interface InventoryProvider {
  readonly revision:number;
  getLocation(id?:string):typeof locations[number]|undefined;
  getRestaurant(id?:string):Restaurant|undefined;
  getMovie(id?:string):typeof movies[number]|undefined;
  getCinema(id?:string):typeof cinemas[number]|undefined;
  getShowtime(id?:string):Showtime|undefined;
  getRoute(from?:string,to?:string):Route|undefined;
  getTransportOption(route:Route|undefined,id?:string):Route['options'][number]|undefined;
  restaurantSlots(restaurant:Restaurant,date:string,plan?:Plan):RestaurantSlot[];
  availableRestaurantSlots(restaurant:Restaurant,date:string,people:number):RestaurantSlot[];
  searchRestaurants(input:{city:string;date:string;people:number;cuisine?:string;minRating?:number;maxPricePerPerson?:number}):Restaurant[];
  searchShowtimes(input:{city:string;date:string;people:number;genre?:string}):Showtime[];
  showtimesForDate(date:string):Showtime[];
  showtimeSnapshot(id?:string,plan?:Plan):Showtime|undefined;
  getReservation(plan:Pick<Plan,'id'|'version'>):Reservation|undefined;
  listReservations():Reservation[];
  reserve(plan:Plan):ToolResult<{reservation:Reservation;idempotent:boolean}>;
  exportState():ProviderState;
  importState(state?:ProviderState):void;
}

export class MutableDemoProvider implements InventoryProvider {
  private state:ProviderState={revision:0,restaurantCapacity:{},showtimeSeats:{},reservations:{}};
  private failNextReservation=false;

  get revision(){return this.state.revision;}
  getLocation(id?:string){return locations.find(item=>item.id===id);}
  getRestaurant(id?:string){return restaurants.find(item=>item.id===id);}
  getMovie(id?:string){return movies.find(item=>item.id===id);}
  getCinema(id?:string){return cinemas.find(item=>item.id===id);}
  getRoute(from?:string,to?:string){return routes.find(item=>item.fromLocationId===from&&item.toLocationId===to);}
  getTransportOption(route:Route|undefined,id?:string){return route?.options.find(item=>item.id===id);}
  private supportsDate(date:string){return date>=PLANNING_WINDOW.start&&date<=PLANNING_WINDOW.end;}

  private generatedShowtimes(date:string){
    if(!this.supportsDate(date))return [];
    return showtimes.filter(item=>item.date==='2026-09-04').map(item=>{
      const id=item.id.replace('2026-09-04',date);
      const dateAdjustment=(Number(date.slice(-2))+item.startTime.charCodeAt(0))%4;
      return {...item,id,date,seatsRemaining:this.state.showtimeSeats[id]??Math.max(4,item.seatsRemaining-dateAdjustment)};
    });
  }

  showtimesForDate(date:string){return this.generatedShowtimes(date);}
  getShowtime(id?:string){
    if(!id)return undefined;
    const date=id.match(dateInId)?.[0];
    return date?this.generatedShowtimes(date).find(item=>item.id===id):undefined;
  }

  getReservation(plan:Pick<Plan,'id'|'version'>){return this.state.reservations[reservationLedgerKey(plan)];}
  listReservations(){return Object.values(this.state.reservations).map(item=>clone(item)).sort((a,b)=>b.version-a.version);}
  showtimeSnapshot(id?:string,plan?:Plan){
    const showtime=this.getShowtime(id);if(!showtime)return undefined;
    const reservation=plan&&this.getReservation(plan);const commitment=reservation?.status==='confirmed'?reservation.inventory.find(item=>item.kind==='showtime'&&item.inventoryKey===showtime.id&&item.state==='committed'):undefined;const owned=Boolean(commitment);
    const inventoryState:InventoryState=owned?'committed_to_current_plan':showtime.seatsRemaining>0?'available':'unavailable';
    return {...showtime,inventoryState,committedQuantity:commitment?.quantity};
  }

  restaurantSlots(restaurant:Restaurant,date:string,plan?:Plan){
    if(!this.supportsDate(date))return [];
    const reservation=plan&&this.getReservation(plan);
    return restaurant.slots.filter(item=>item.date==='2026-09-04').map(item=>{
      const key=restaurantKey(restaurant.id,date,item.time);
      const dateAdjustment=(Number(date.slice(-2))+restaurant.id.length+item.time.charCodeAt(0))%3;
      const capacityRemaining=this.state.restaurantCapacity[key]??Math.max(2,item.capacityRemaining-dateAdjustment);
      const commitment=reservation?.status==='confirmed'?reservation.inventory.find(record=>record.kind==='restaurant'&&record.inventoryKey===key&&record.state==='committed'):undefined;const owned=Boolean(commitment);
      const inventoryState:InventoryState=owned?'committed_to_current_plan':capacityRemaining>0?'available':'unavailable';
      return {...item,date,capacityRemaining,inventoryState,committedQuantity:commitment?.quantity};
    });
  }

  availableRestaurantSlots(restaurant:Restaurant,date:string,people:number){
    return this.restaurantSlots(restaurant,date).filter(slot=>slot.inventoryState==='available'&&slot.capacityRemaining>=people&&people>=restaurant.minParty&&people<=restaurant.maxParty);
  }

  searchRestaurants(input:{city:string;date:string;people:number;cuisine?:string;minRating?:number;maxPricePerPerson?:number}){
    return restaurants.filter(restaurant=>restaurant.city===input.city
      &&(!input.cuisine||restaurant.cuisine.toLowerCase().includes(input.cuisine.toLowerCase()))
      &&(!input.minRating||restaurant.rating>=input.minRating)
      &&(!input.maxPricePerPerson||restaurant.pricePerPerson<=input.maxPricePerPerson)
      &&this.availableRestaurantSlots(restaurant,input.date,input.people).length>0);
  }

  searchShowtimes(input:{city:string;date:string;people:number;genre?:string}){
    return this.generatedShowtimes(input.date).filter(showtime=>showtime.seatsRemaining>=input.people).filter(showtime=>{
      const movie=this.getMovie(showtime.movieId);const cinema=this.getCinema(showtime.cinemaId);
      return Boolean(movie&&cinema?.city===input.city&&(!input.genre||movie.genre.toLowerCase().includes(input.genre.toLowerCase())));
    });
  }

  reserve(plan:Plan):ToolResult<{reservation:Reservation;idempotent:boolean}>{
    // The ledger key is plan identity; replay additionally requires an identical content
    // fingerprint, so a forged or replayed plan that reuses the key but changes the
    // restaurant, movie, showtime, date, party size, or inventory key can never replay.
    const ledgerKey=reservationLedgerKey(plan);const fingerprint=reservationFingerprint(plan,this);
    const existing=this.state.reservations[ledgerKey];
    if(existing){
      if(existing.fingerprint!==fingerprint)return fail('RESERVATION_INTENT_MISMATCH',`Reservation ${existing.id} was committed for different selections. A changed plan must be a new version, not a replay.`,undefined,false);
      return ok({reservation:clone(existing),idempotent:true});
    }
    if(this.failNextReservation){this.failNextReservation=false;return fail('PROVIDER_UNAVAILABLE','The sandbox provider failed before inventory was changed.',undefined,true);}
    const restaurant=this.getRestaurant(plan.selections.restaurantId);const showtime=this.getShowtime(plan.selections.showtimeId);
    const slot=restaurant&&this.availableRestaurantSlots(restaurant,plan.date,plan.people).find(item=>item.time===plan.selections.restaurantSlot);
    if(!restaurant||!slot||!showtime||showtime.seatsRemaining<plan.people)return fail('PROVIDER_CONFLICT','Provider inventory changed. Refresh and repair the plan before approving again.',undefined,true);
    const reservedAt=new Date().toISOString();const tableKey=restaurantKey(restaurant.id,plan.date,slot.time);
    const reservation:Reservation={id:`SBX-${plan.id.toUpperCase()}-V${plan.version}`,planId:plan.id,version:plan.version,providerRevision:this.state.revision+1,status:'confirmed',reservedAt,idempotencyKey:fingerprint,fingerprint,inventory:[{kind:'restaurant',inventoryKey:tableKey,quantity:plan.people,state:'committed'},{kind:'showtime',inventoryKey:showtime.id,quantity:plan.people,state:'committed'}]};
    this.state.restaurantCapacity[tableKey]=slot.capacityRemaining-plan.people;
    this.state.showtimeSeats[showtime.id]=showtime.seatsRemaining-plan.people;
    this.state.reservations[ledgerKey]=reservation;this.state.revision++;
    return ok({reservation:clone(reservation),idempotent:false});
  }

  setRestaurantCapacity(restaurantId:string,date:string,time:string,capacity:number){this.state.restaurantCapacity[restaurantKey(restaurantId,date,time)]=Math.max(0,capacity);this.state.revision++;}
  setShowtimeSeats(showtimeId:string,seats:number){this.state.showtimeSeats[showtimeId]=Math.max(0,seats);this.state.revision++;}
  simulateNextReservationFailure(){this.failNextReservation=true;}
  exportState(){return clone(this.state);}
  importState(state?:ProviderState){if(state)this.state=clone(state);}
  reset(){this.state={revision:0,restaurantCapacity:{},showtimeSeats:{},reservations:{}};this.failNextReservation=false;}
}

export const demoProvider=new MutableDemoProvider();
export const getLocation=(id?:string,provider:InventoryProvider=demoProvider)=>provider.getLocation(id);
export const getRestaurant=(id?:string,provider:InventoryProvider=demoProvider)=>provider.getRestaurant(id);
export const getMovie=(id?:string,provider:InventoryProvider=demoProvider)=>provider.getMovie(id);
export const getCinema=(id?:string,provider:InventoryProvider=demoProvider)=>provider.getCinema(id);
export const getShowtime=(id?:string,provider:InventoryProvider=demoProvider)=>provider.getShowtime(id);
export const getRoute=(from?:string,to?:string,provider:InventoryProvider=demoProvider)=>provider.getRoute(from,to);
export const getTransportOption=(route:Route|undefined,id?:string,provider:InventoryProvider=demoProvider)=>provider.getTransportOption(route,id);
export const availableRestaurantSlots=(restaurant:Restaurant,date:string,people:number,provider:InventoryProvider=demoProvider)=>provider.availableRestaurantSlots(restaurant,date,people);
export const searchRestaurantInventory=(input:Parameters<InventoryProvider['searchRestaurants']>[0],provider:InventoryProvider=demoProvider)=>provider.searchRestaurants(input);
export const searchShowtimeInventory=(input:Parameters<InventoryProvider['searchShowtimes']>[0],provider:InventoryProvider=demoProvider)=>provider.searchShowtimes(input);
export const routeInventory=(fromLocationId:string,toLocationId:string,provider:InventoryProvider=demoProvider)=>provider.getRoute(fromLocationId,toLocationId);
export const showtimeDetails=(showtime:Showtime,provider:InventoryProvider=demoProvider)=>({showtime,movie:provider.getMovie(showtime.movieId),cinema:provider.getCinema(showtime.cinemaId)});
