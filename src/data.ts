import { Cinema, Location, Movie, Plan, Restaurant, Route, Showtime } from './types';

export const locations: Location[] = [
  { id: 'dhanmondi-27', name: 'Dhanmondi 27', area: 'Dhanmondi', city: 'Dhaka' },
  { id: 'gulshan-2', name: 'Gulshan 2', area: 'Gulshan', city: 'Dhaka' },
  { id: 'banani-11', name: 'Banani 11', area: 'Banani', city: 'Dhaka' },
  { id: 'uttara-7', name: 'Uttara Sector 7', area: 'Uttara', city: 'Dhaka' },
  { id: 'bashundhara-city', name: 'Bashundhara City', area: 'Panthapath', city: 'Dhaka' },
  { id: 'jamuna-future-park', name: 'Jamuna Future Park', area: 'Baridhara', city: 'Dhaka' },
];

const slots = (times: string[], capacity = 8) => ['2026-09-04', '2026-09-05'].flatMap(date => times.map((time, index) => ({ date, time, capacityRemaining: Math.max(2, capacity - index) })));

export const restaurants: Restaurant[] = [
  { id:'bistro-17', name:'Bistro 17', cuisine:'Modern Bengali', city:'Dhaka', locationId:'dhanmondi-27', rating:4.8, pricePerPerson:850, description:'Seasonal Bengali plates in a quiet garden room.', image:'🍛', openingHours:'17:00–23:00', minParty:1, maxParty:8, slots:slots(['17:45','18:00','18:30'],9) },
  { id:'saffron-table', name:'Saffron Table', cuisine:'Indian', city:'Dhaka', locationId:'gulshan-2', rating:4.7, pricePerPerson:1050, description:'Regional Indian cooking with a contemporary edge.', image:'🍽️', openingHours:'17:30–23:30', minParty:1, maxParty:10, slots:slots(['17:45','18:15','18:45'],10) },
  { id:'smoke-house', name:'The Smoke House', cuisine:'Grill & Barbecue', city:'Dhaka', locationId:'banani-11', rating:4.6, pricePerPerson:1250, description:'Charcoal-grilled favourites in a lively late-night room.', image:'🔥', openingHours:'18:00–00:00', minParty:2, maxParty:8, slots:slots(['18:00','18:30','19:00'],7) },
  { id:'riverstone', name:'Riverstone Kitchen', cuisine:'Asian Fusion', city:'Dhaka', locationId:'uttara-7', rating:4.5, pricePerPerson:700, description:'Bright, shareable plates for an easygoing evening.', image:'🌿', openingHours:'17:00–22:30', minParty:1, maxParty:12, slots:slots(['17:30','18:00','18:30'],12) },
  { id:'pasta-fresco', name:'Pasta Fresco', cuisine:'Italian', city:'Dhaka', locationId:'dhanmondi-27', rating:4.6, pricePerPerson:900, description:'Handmade pasta and an intimate neighbourhood feel.', image:'🍝', openingHours:'17:30–23:00', minParty:1, maxParty:6, slots:slots(['17:45','18:15','18:45'],6) },
  { id:'jade-lantern', name:'Jade Lantern', cuisine:'Chinese', city:'Dhaka', locationId:'gulshan-2', rating:4.4, pricePerPerson:780, description:'Cantonese comfort food designed for sharing.', image:'🥟', openingHours:'17:00–23:00', minParty:2, maxParty:10, slots:slots(['17:30','18:00','18:30'],8) },
];

export const cinemas: Cinema[] = [
  { id:'star-bashundhara', name:'Star Cineplex, Bashundhara City', city:'Dhaka', locationId:'bashundhara-city' },
  { id:'blockbuster-jamuna', name:'Blockbuster Cinemas, Jamuna Future Park', city:'Dhaka', locationId:'jamuna-future-park' },
];

export const movies: Movie[] = [
  { id:'the-last-signal', title:'The Last Signal', genre:'Sci-Fi', durationMinutes:128, rating:8.4, poster:'🎬', description:'A deep-space rescue receives a signal from its own future.' },
  { id:'paper-moons', title:'Paper Moons', genre:'Drama', durationMinutes:114, rating:8.1, poster:'🌙', description:'Two siblings rebuild a theatre and their relationship.' },
  { id:'laugh-track', title:'Laugh Track', genre:'Comedy', durationMinutes:101, rating:7.6, poster:'😄', description:'A sound engineer wakes up inside a sitcom.' },
  { id:'monsoon-code', title:'Monsoon Code', genre:'Thriller', durationMinutes:119, rating:8.0, poster:'🌧️', description:'A data journalist follows a trail through a flooded city.' },
];

const showsFor = (date: string): Showtime[] => [
  {id:`tls-${date}-2015`,movieId:'the-last-signal',cinemaId:'star-bashundhara',date,startTime:'20:15',price:550,capacity:120,seatsRemaining:42},
  {id:`tls-${date}-2145`,movieId:'the-last-signal',cinemaId:'blockbuster-jamuna',date,startTime:'21:45',price:600,capacity:100,seatsRemaining:18},
  {id:`pm-${date}-2000`,movieId:'paper-moons',cinemaId:'blockbuster-jamuna',date,startTime:'20:00',price:500,capacity:100,seatsRemaining:36},
  {id:`pm-${date}-2200`,movieId:'paper-moons',cinemaId:'star-bashundhara',date,startTime:'22:00',price:550,capacity:120,seatsRemaining:8},
  {id:`lt-${date}-2030`,movieId:'laugh-track',cinemaId:'star-bashundhara',date,startTime:'20:30',price:450,capacity:120,seatsRemaining:64},
  {id:`lt-${date}-2115`,movieId:'laugh-track',cinemaId:'blockbuster-jamuna',date,startTime:'21:15',price:475,capacity:100,seatsRemaining:27},
  {id:`mc-${date}-2045`,movieId:'monsoon-code',cinemaId:'blockbuster-jamuna',date,startTime:'20:45',price:525,capacity:100,seatsRemaining:31},
];
export const showtimes: Showtime[] = [...showsFor('2026-09-04'), ...showsFor('2026-09-05')];

const route = (fromLocationId:string,toLocationId:string,distanceKm:number,duration:number,baseFare:number):Route => ({
  id:`${fromLocationId}--${toLocationId}`,fromLocationId,toLocationId,distanceKm,
  options:[
    {id:`${fromLocationId}--${toLocationId}--economy`,name:'City Economy',kind:'economy',durationMinutes:duration+4,fare:baseFare,description:'Everyday air-conditioned ride'},
    {id:`${fromLocationId}--${toLocationId}--comfort`,name:'City Comfort',kind:'comfort',durationMinutes:duration,fare:baseFare+140,description:'Newer car with priority pickup'},
    {id:`${fromLocationId}--${toLocationId}--metro`,name:'Metro + short ride',kind:'metro',durationMinutes:duration+12,fare:Math.max(160,baseFare-180),description:'Best-value mixed transit route'},
  ]
});
export const routes: Route[] = [
  route('dhanmondi-27','bashundhara-city',6.2,25,360), route('dhanmondi-27','jamuna-future-park',12.8,38,520),
  route('gulshan-2','bashundhara-city',8.4,32,430), route('gulshan-2','jamuna-future-park',4.6,18,280),
  route('banani-11','bashundhara-city',7.1,28,390), route('banani-11','jamuna-future-park',5.8,22,320),
  route('uttara-7','bashundhara-city',17.5,46,650), route('uttara-7','jamuna-future-park',12.1,35,500),
];

export const defaultPreferences = (): Plan['preferences'] => ({ transport:'lowest_cost', priority:'balanced', timing:'relaxed', minRestaurantRating:4.2 });
export const initialPlan = (): Plan => ({
  id:'current-plan', version:1, city:'Dhaka', date:'2026-09-04', people:3, budget:5000,
  preferences:defaultPreferences(), dinnerDurationMinutes:75, bufferMinutes:15, selections:{},
  status:'draft', updatedAt:new Date().toISOString(), changeSummary:'Started a new evening plan'
});
