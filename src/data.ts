import { Movie, Plan, Restaurant, Ride } from './types';
export const restaurants: Restaurant[] = [
  { id:'bistro-17', name:'Bistro 17', cuisine:'Modern Bengali', area:'Dhanmondi', city:'Dhaka', rating:4.8, pricePerPerson:950, description:'Thoughtful Bengali plates, warm light, and a quiet garden table.', image:'🍛' },
  { id:'saffron-table', name:'Saffron Table', cuisine:'Indian', area:'Gulshan 2', city:'Dhaka', rating:4.7, pricePerPerson:1200, description:'Regional Indian cooking with a sharp, contemporary edge.', image:'🍽️' },
  { id:'smoke-house', name:'The Smoke House', cuisine:'Grill & Barbecue', area:'Banani', city:'Dhaka', rating:4.6, pricePerPerson:1450, description:'Charcoal-grilled favourites in a lively, late-night room.', image:'🔥' },
  { id:'riverstone', name:'Riverstone Kitchen', cuisine:'Asian Fusion', area:'Uttara', city:'Dhaka', rating:4.5, pricePerPerson:800, description:'Bright, shareable plates for an easygoing evening.', image:'🌿' },
  { id:'pasta-fresco', name:'Pasta Fresco', cuisine:'Italian', area:'Dhanmondi', city:'Dhaka', rating:4.6, pricePerPerson:1100, description:'Handmade pasta, tiramisu, and an intimate neighbourhood feel.', image:'🍝' },
];
export const movies: Movie[] = [
  { id:'the-last-signal', title:'The Last Signal', genre:'Sci-fi thriller', duration:128, rating:8.4, cinema:'Star Cineplex, Bashundhara', poster:'🎬', showtimes:[{id:'tls-1830',date:'2026-09-04',time:'6:30 PM',price:650,seats:42},{id:'tls-2115',date:'2026-09-04',time:'9:15 PM',price:750,seats:18}] },
  { id:'paper-moons', title:'Paper Moons', genre:'Drama', duration:114, rating:8.1, cinema:'Blockbuster Cinemas, Jamuna', poster:'🌙', showtimes:[{id:'pm-1900',date:'2026-09-04',time:'7:00 PM',price:550,seats:36},{id:'pm-2145',date:'2026-09-04',time:'9:45 PM',price:600,seats:8}] },
  { id:'laugh-track', title:'Laugh Track', genre:'Comedy', duration:101, rating:7.6, cinema:'Star Cineplex, Bashundhara', poster:'😄', showtimes:[{id:'lt-1845',date:'2026-09-04',time:'6:45 PM',price:500,seats:64},{id:'lt-2030',date:'2026-09-04',time:'8:30 PM',price:500,seats:27}] },
];
export const rides: Ride[] = [
  {id:'pathao-car',name:'Pathao Comfort',from:'Dhanmondi',to:'Bashundhara City',eta:'28–35 min',fare:480,comfort:'Air-conditioned'},
  {id:'uber-go',name:'Uber Go',from:'Dhanmondi',to:'Bashundhara City',eta:'30–40 min',fare:420,comfort:'Everyday ride'},
  {id:'metro-ride',name:'Metro + short ride',from:'Dhanmondi',to:'Bashundhara City',eta:'42–50 min',fare:180,comfort:'Best value'},
];
export const initialPlan: Plan = {city:'Dhaka',date:'2026-09-04',people:3,budget:5000,preferences:'highly-rated dinner, a movie afterward',approved:false};
