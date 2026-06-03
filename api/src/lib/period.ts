export interface Period {
  year: number;
  month: number;
}

export type PeriodResult =
  | { ok: true; period: Period }
  | { ok: false; error: string };

/**
 * Resolve a (year, month) period from raw query-string values.
 *
 * - When a value is absent (undefined or empty string), it defaults to the
 *   corresponding component of `now`.
 * - When a value is PRESENT but invalid (non-integer, out of range), an error
 *   is returned rather than silently falling back to the current period.
 *   This avoids the silent-fallback bug where `?month=0` or `?month=abc`
 *   quietly returned the current month's data with a 200.
 */
export function resolvePeriod(
  yearRaw?: string,
  monthRaw?: string,
  now: Date = new Date(),
): PeriodResult {
  let year = now.getFullYear();
  let month = now.getMonth() + 1;

  if (yearRaw !== undefined && yearRaw !== '') {
    const y = Number(yearRaw);
    if (!Number.isInteger(y) || y < 1970 || y > 9999) {
      return { ok: false, error: 'year must be an integer between 1970 and 9999' };
    }
    year = y;
  }

  if (monthRaw !== undefined && monthRaw !== '') {
    const m = Number(monthRaw);
    if (!Number.isInteger(m) || m < 1 || m > 12) {
      return { ok: false, error: 'month must be an integer between 1 and 12' };
    }
    month = m;
  }

  return { ok: true, period: { year, month } };
}
