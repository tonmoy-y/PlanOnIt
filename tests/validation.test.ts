import { describe, expect, it } from 'vitest';
import { createPlanSchema, parseInput, updatePlanSchema } from '../src/validation';
import { defaultPreferences } from '../src/data';

describe('runtime input validation',()=>{
  it.each([
    ['missing fields',{}],['null',null],['wrong people type',{city:'Dhaka',date:'2026-09-04',people:'3',budget:5000,preferences:defaultPreferences()}],['excessive people',{city:'Dhaka',date:'2026-09-04',people:50,budget:5000,preferences:defaultPreferences()}],['invalid city',{city:'Chattogram',date:'2026-09-04',people:3,budget:5000,preferences:defaultPreferences()}],['invalid date',{city:'Dhaka',date:'not-a-date',people:3,budget:5000,preferences:defaultPreferences()}]
  ])('rejects %s',(_name,value)=>{const result=parseInput(createPlanSchema,value);expect(result.ok).toBe(false);if(!result.ok){expect(result.error.code).toBe('INVALID_INPUT');expect(result.error.retryable).toBe(true);}});
  it('rejects empty updates',()=>{const result=parseInput(updatePlanSchema,{expectedVersion:1});expect(result.ok).toBe(false);});
  it('requires atomic movie/showtime updates',()=>{const result=parseInput(updatePlanSchema,{expectedVersion:1,movieId:'paper-moons'});expect(result.ok).toBe(false);if(!result.ok)expect(result.error.field).toBe('movieId');});
  it('rejects unknown extra input fields',()=>{const result=parseInput(createPlanSchema,{city:'Dhaka',date:'2026-09-04',people:3,budget:5000,preferences:defaultPreferences(),admin:true});expect(result.ok).toBe(false);});
});
