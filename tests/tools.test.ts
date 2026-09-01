import { describe, expect, it } from 'vitest';
import { initialPlan } from '../src/data';
import { buildTools } from '../src/tools';
import { Plan } from '../src/types';

describe('WebMCP tools', () => {
  function harness() {
    let plan: Plan = initialPlan;
    const activities: string[] = [];
    const tools = buildTools(() => plan, (next, activity) => { plan = next; activities.push(activity); });
    return { tools, get plan() { return plan; }, activities };
  }

  it('exposes agent-friendly schemas and assembles a complete draft', async () => {
    const h = harness();
    expect(h.tools.map(t => t.name)).toEqual(['search_restaurants','find_showtimes','estimate_ride','create_evening_plan','get_current_plan','update_plan','calculate_total_cost','reserve_plan']);
    const create = h.tools.find(t => t.name === 'create_evening_plan')!;
    const result: any = await create.execute({ city: 'Dhaka', date: '2026-09-04', people: 3, budget: 5000, preferences: 'highly-rated dinner' });
    expect(result.ok).toBe(true);
    expect(result.plan.total).toBe(4830);
    expect(h.activities).toHaveLength(1);
  });

  it('returns structured errors and blocks consequential actions', async () => {
    const h = harness();
    const update: any = h.tools.find(t => t.name === 'update_plan')!;
    expect((await update.execute({ restaurantId: 'not-a-real-id' })).ok).toBe(false);
    const reserve: any = h.tools.find(t => t.name === 'reserve_plan')!;
    expect((await reserve.execute({ confirmation: 'APPROVE_DRAFT' })).error).toMatch(/approve/i);
  });
});
