import { fetchTrueLayer } from '@/truelayer/client';

describe('fetchTrueLayer', () => {
  it('sends Authorization: Bearer header', async () => {
    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ results: [], status: 'Succeeded' }),
    }) as jest.Mock;

    await fetchTrueLayer('/data/v1/accounts', 'my-access-token');

    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe('https://api.truelayer.com/data/v1/accounts');
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer my-access-token');
  });

  it('throws when the response is not ok', async () => {
    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: async () => 'Unauthorized',
    }) as jest.Mock;

    await expect(fetchTrueLayer('/data/v1/accounts', 'bad-token')).rejects.toThrow('TrueLayer API 401');
  });
});
