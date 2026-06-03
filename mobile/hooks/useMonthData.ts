import { useState, useEffect } from 'react';
import { apiGet } from '@/lib/api';

export type FetchState<T> =
  | { status: 'loading' }
  | { status: 'error'; error: string }
  | { status: 'success'; data: T };

/**
 * Generic hook that fetches a typed resource from the API whenever
 * userId, year, or month changes. Uses plain useEffect+state per §13 (no React Query).
 */
export function useMonthData<T>(
  buildPath: (userId: string, year: number, month: number) => string,
  userId: string,
  year: number,
  month: number,
): FetchState<T> {
  const [state, setState] = useState<FetchState<T>>({ status: 'loading' });

  // Compute the path on every render (cheap string build) and key the effect on
  // it. Depending on the resolved path — rather than [userId, year, month] —
  // means the fetch also re-runs when buildPath closes over other inputs that
  // change (e.g. account/bucket/q filters), avoiding a stale-closure refetch bug.
  const path = buildPath(userId, year, month);

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    apiGet<T>(path)
      .then(data => {
        if (!cancelled) setState({ status: 'success', data });
      })
      .catch(err => {
        if (!cancelled)
          setState({ status: 'error', error: (err as Error).message });
      });
    return () => {
      cancelled = true;
    };
  }, [path]);

  return state;
}
