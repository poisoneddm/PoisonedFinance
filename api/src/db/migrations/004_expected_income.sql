-- Expected (planned) monthly income, used to drive budget targets so the plan is
-- stable from day 1 of the month instead of tracking actual income-to-date.
-- NULL means "no user override" — the app falls back to a history-derived
-- suggestion, then to actual income for the month (cold start).
ALTER TABLE monthly_goals ADD COLUMN expected_income_pence INTEGER;
