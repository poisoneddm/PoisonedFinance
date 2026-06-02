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

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    apiGet<T>(buildPath(userId, year, month))
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
  }, [userId, year, month]);

  return state;
}
