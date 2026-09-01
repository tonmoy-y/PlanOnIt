import { describe, expect, it } from 'vitest';
import { createPlanSchema, dateSchema, parseInput, planningDateSchema, updatePlanSchema } from '../src/validation';
import { defaultPreferences } from '../src/data';

describe('runtime input validation',()=>{
  it.each([
    ['missing fields',{}],['null',null],['wrong people type',{city:'Dhaka',date:'2026-09-04',people:'3',budget:5000,preferences:defaultPreferences()}],['excessive people',{city:'Dhaka',date:'2026-09-04',people:50,budget:5000,preferences:defaultPreferences()}],['invalid city',{city:'Chattogram',date:'2026-09-04',people:3,budget:5000,preferences:defaultPreferences()}],['invalid date',{city:'Dhaka',date:'not-a-date',people:3,budget:5000,preferences:defaultPreferences()}]
  ])('rejects %s',(_name,value)=>{const result=parseInput(createPlanSchema,value);expect(result.ok).toBe(false);if(!result.ok){expect(result.error.code).toBe('INVALID_INPUT');expect(result.error.retryable).toBe(true);}});
  it('rejects empty updates',()=>{const result=parseInput(updatePlanSchema,{expectedVersion:1});expect(result.ok).toBe(false);});
  it('requires atomic movie/showtime updates',()=>{const result=parseInput(updatePlanSchema,{expectedVersion:1,movieId:'paper-moons'});expect(result.ok).toBe(false);if(!result.ok)expect(result.error.field).toBe('movieId');});
  it('rejects unknown extra input fields',()=>{const result=parseInput(createPlanSchema,{city:'Dhaka',date:'2026-09-04',people:3,budget:5000,preferences:defaultPreferences(),admin:true});expect(result.ok).toBe(false);});
  it.each(['2026-02-30','2025-02-29','2026-13-01','2026-00-10','2026-04-31'])('rejects impossible calendar date %s',value=>{expect(dateSchema.safeParse(value).success).toBe(false);});
  it.each(['2024-02-29','2000-02-29','2026-01-01','2026-12-31'])('accepts real boundary date %s',value=>{expect(dateSchema.safeParse(value).success).toBe(true);});
  it.each(['2026-09-03','2026-09-16'])('accepts supported inventory boundary %s',value=>{expect(planningDateSchema.safeParse(value).success).toBe(true);});
  it.each(['2026-09-02','2026-09-17','2024-02-29'])('rejects past or unsupported inventory date %s',value=>{expect(planningDateSchema.safeParse(value).success).toBe(false);});
  it('rejects negative and excessive manual-style updates at the domain schema',()=>{expect(parseInput(updatePlanSchema,{expectedVersion:1,budget:-10}).ok).toBe(false);expect(parseInput(updatePlanSchema,{expectedVersion:1,budget:100001}).ok).toBe(false);expect(parseInput(updatePlanSchema,{expectedVersion:1,people:13}).ok).toBe(false);});
});
