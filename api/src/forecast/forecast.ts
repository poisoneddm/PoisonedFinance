import { Pool } from 'pg';
import { incomeForMonth, bucketSpendForMonth } from '@/lib/money';
import { getOrCreateGoal } from '@/lib/goals';
import { monthlyAverages } from '@/forecast/trends';

export type TierName = 'Goal' | 'Realistic' | 'Stretch' | 'Actual';
export type Badge = 'on-track' | 'behind' | 'stretch';

export interface ForecastTier {
  name: TierName;
  monthly_pence: number;
  annual_pence: number;
  badge: Badge;
}

/**
 * Compute the 4 savings-forecast tiers for a given user/month (contracts §8).
 *
 * Formulas (all integer pence, clamp realistic/stretch >= 0):
 *   goal_pence      = ROUND(income_this_month * savings_pct / 100)
 *   realistic_pence = ROUND(avg6_income - avg6_needs - avg6_wants)           clamped >= 0
 *   stretch_pence   = ROUND(avg6_income - avg6_needs - 0.70 * avg6_wants)    clamped >= 0
 *   actual_pence    = savings bucket spend this month (§5)
 *
 * Badge rules (compare tier monthly vs goal_pence):
 *   tier >= goal  → 'on-track'
 *   tier <  goal  → 'behind'
 *   Stretch tier always carries badge 'stretch' (overrides comparison)
 */
export async function computeForecast(
  pool: Pool,
  userId: string,
  year: number,
  month: number,
): Promise<ForecastTier[]> {
  const [goal, income_pence, actual_pence, avgs] = await Promise.all([
    getOrCreateGoal(userId, year, month),
    incomeForMonth(userId, year, month),
    bucketSpendForMonth(userId, 'savings', year, month),
    monthlyAverages(pool, userId),
  ]);

  const goal_pence = Math.round(income_pence * goal.savings_pct / 100);

  const realistic_raw = Math.round(avgs.avg_income_pence - avgs.avg_needs_pence - avgs.avg_wants_pence);
  const realistic_pence = Math.max(0, realistic_raw);

  const stretch_raw = Math.round(avgs.avg_income_pence - avgs.avg_needs_pence - 0.70 * avgs.avg_wants_pence);
  const stretch_pence = Math.max(0, stretch_raw);

  function badge(monthly: number): Badge {
    return monthly >= goal_pence ? 'on-track' : 'behind';
  }

  return [
    {
      name: 'Goal',
      monthly_pence: goal_pence,
      annual_pence: goal_pence * 12,
      badge: badge(goal_pence),
    },
    {
      name: 'Realistic',
      monthly_pence: realistic_pence,
      annual_pence: realistic_pence * 12,
      badge: badge(realistic_pence),
    },
    {
      name: 'Stretch',
      monthly_pence: stretch_pence,
      annual_pence: stretch_pence * 12,
      badge: 'stretch',
    },
    {
      name: 'Actual',
      monthly_pence: actual_pence,
      annual_pence: actual_pence * 12,
      badge: badge(actual_pence),
    },
  ];
}
