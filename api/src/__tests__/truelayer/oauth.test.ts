import { buildAuthUrl, exchangeCode, refreshAccessToken } from '@/truelayer/oauth';

const ENV = {
  TRUELAYER_CLIENT_ID: 'test-client-id',
  TRUELAYER_CLIENT_SECRET: 'test-secret',
  TRUELAYER_REDIRECT_URI: 'http://localhost:3000/auth/callback',
};

beforeEach(() => Object.assign(process.env, ENV));

describe('buildAuthUrl', () => {
  it('includes required OAuth params', () => {
    const url = new URL(buildAuthUrl('state-abc'));
    expect(url.hostname).toBe('auth.truelayer.com');
    expect(url.searchParams.get('client_id')).toBe('test-client-id');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('redirect_uri')).toBe('http://localhost:3000/auth/callback');
    expect(url.searchParams.get('state')).toBe('state-abc');
  });

  it('requests the data scope', () => {
    const url = new URL(buildAuthUrl('x'));
    const scope = url.searchParams.get('scope') ?? '';
    expect(scope).toContain('accounts');
    expect(scope).toContain('transactions');
  });
});

describe('exchangeCode', () => {
  it('POSTs to token endpoint with correct body', async () => {
    const mockResponse = {
      access_token: 'acc', refresh_token: 'ref',
      expires_in: 3600, token_type: 'Bearer', scope: 'accounts transactions',
    };
    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    }) as jest.Mock;

    const result = await exchangeCode('auth-code-123');

    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe('https://auth.truelayer.com/connect/token');
    const body = new URLSearchParams(init.body as string);
    expect(body.get('code')).toBe('auth-code-123');
    expect(body.get('grant_type')).toBe('authorization_code');
    expect(result.access_token).toBe('acc');
  });
});

describe('refreshAccessToken', () => {
  it('POSTs refresh_token grant and returns new tokens', async () => {
    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: 'new-acc', refresh_token: 'new-ref', expires_in: 3600, token_type: 'Bearer', scope: '' }),
    }) as jest.Mock;

    const result = await refreshAccessToken('old-refresh-token');

    const body = new URLSearchParams((global.fetch as jest.Mock).mock.calls[0][1].body as string);
    expect(body.get('grant_type')).toBe('refresh_token');
    expect(body.get('refresh_token')).toBe('old-refresh-token');
    expect(result.access_token).toBe('new-acc');
  });
});
