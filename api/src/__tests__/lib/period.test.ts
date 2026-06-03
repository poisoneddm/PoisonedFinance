import { resolvePeriod } from '@/lib/period';

const NOW = new Date('2026-06-15T12:00:00Z');

describe('resolvePeriod', () => {
  it('defaults to the current year and month when both params are absent', () => {
    const r = resolvePeriod(undefined, undefined, NOW);
    expect(r).toEqual({ ok: true, period: { year: 2026, month: 6 } });
  });

  it('uses provided valid year and month', () => {
    const r = resolvePeriod('2025', '3', NOW);
    expect(r).toEqual({ ok: true, period: { year: 2025, month: 3 } });
  });

  it('defaults the missing half (month provided, year absent)', () => {
    const r = resolvePeriod(undefined, '4', NOW);
    expect(r).toEqual({ ok: true, period: { year: 2026, month: 4 } });
  });

  it('rejects month = 0', () => {
    const r = resolvePeriod('2026', '0', NOW);
    expect(r.ok).toBe(false);
  });

  it('rejects month = 13', () => {
    const r = resolvePeriod('2026', '13', NOW);
    expect(r.ok).toBe(false);
  });

  it('rejects a non-numeric month', () => {
    const r = resolvePeriod('2026', 'abc', NOW);
    expect(r.ok).toBe(false);
  });

  it('rejects a decimal month', () => {
    const r = resolvePeriod('2026', '6.5', NOW);
    expect(r.ok).toBe(false);
  });

  it('rejects a non-numeric year', () => {
    const r = resolvePeriod('not-a-year', '6', NOW);
    expect(r.ok).toBe(false);
  });

  it('does NOT silently fall back to the current month on invalid input', () => {
    // Regression for the silent-fallback bug: an explicit bad value must error,
    // not quietly return the current month.
    const r = resolvePeriod('2026', '0', NOW);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/month/i);
  });
});
