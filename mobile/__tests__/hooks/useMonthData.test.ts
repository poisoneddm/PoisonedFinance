import { renderHook, waitFor } from '@testing-library/react-native';
import { useMonthData } from '@/hooks/useMonthData';

const mockApiGet = jest.fn();
jest.mock('@/lib/api', () => ({ apiGet: (p: string) => mockApiGet(p) }));

describe('useMonthData', () => {
  beforeEach(() => mockApiGet.mockReset());

  it('fetches on mount and exposes success state', async () => {
    mockApiGet.mockResolvedValueOnce({ ok: true });
    const { result } = renderHook(() =>
      useMonthData<{ ok: boolean }>((u, y, m) => `/dash/${u}?y=${y}&m=${m}`, 'u1', 2026, 6),
    );
    await waitFor(() => expect(result.current.status).toBe('success'));
    expect(mockApiGet).toHaveBeenCalledWith('/dash/u1?y=2026&m=6');
  });

  it('refetches when the built path changes via a captured filter (not just year/month)', async () => {
    // Regression for the stale-closure bug: buildPath closes over `q`, but the
    // effect previously only depended on [userId, year, month], so a filter
    // change would NOT refetch.
    mockApiGet.mockImplementation(async (p: string) => ({ path: p }));
    let q = 'tesco';
    const build = (u: string, y: number, m: number) =>
      `/transactions/${u}?year=${y}&month=${m}&q=${q}`;

    const { result, rerender } = renderHook(
      ({ uid, yr, mo }: { uid: string; yr: number; mo: number }) =>
        useMonthData(build, uid, yr, mo),
      { initialProps: { uid: 'u1', yr: 2026, mo: 6 } },
    );

    await waitFor(() => expect(result.current.status).toBe('success'));
    expect(mockApiGet).toHaveBeenLastCalledWith('/transactions/u1?year=2026&month=6&q=tesco');

    q = 'amazon';
    rerender({ uid: 'u1', yr: 2026, mo: 6 });

    await waitFor(() =>
      expect(mockApiGet).toHaveBeenLastCalledWith('/transactions/u1?year=2026&month=6&q=amazon'),
    );
  });

  it('sets error state when the request rejects', async () => {
    mockApiGet.mockRejectedValueOnce(new Error('boom'));
    const { result } = renderHook(() =>
      useMonthData((u, y, m) => `/x/${u}/${y}/${m}`, 'u1', 2026, 6),
    );
    await waitFor(() => expect(result.current.status).toBe('error'));
  });
});
