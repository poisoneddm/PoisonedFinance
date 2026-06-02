import type { TrueLayerTokenResponse } from './types';

const AUTH_BASE = 'https://auth.truelayer.com';
const SCOPES = 'accounts balance transactions offline_access';
const PROVIDERS = 'uk-ob-natwest uk-ob-halifax uk-monzo';

function getEnv() {
  const clientId = process.env.TRUELAYER_CLIENT_ID!;
  const clientSecret = process.env.TRUELAYER_CLIENT_SECRET!;
  const redirectUri = process.env.TRUELAYER_REDIRECT_URI!;
  return { clientId, clientSecret, redirectUri };
}

export function buildAuthUrl(state: string): string {
  const { clientId, redirectUri } = getEnv();
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    scope: SCOPES,
    redirect_uri: redirectUri,
    providers: PROVIDERS,
    state,
  });
  return `${AUTH_BASE}/?${params.toString()}`;
}

async function postTokenEndpoint(body: URLSearchParams): Promise<TrueLayerTokenResponse> {
  const res = await fetch(`${AUTH_BASE}/connect/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!res.ok) throw new Error(`TrueLayer token error: ${res.status}`);
  return res.json() as Promise<TrueLayerTokenResponse>;
}

export function exchangeCode(code: string): Promise<TrueLayerTokenResponse> {
  const { clientId, clientSecret, redirectUri } = getEnv();
  return postTokenEndpoint(new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    code,
  }));
}

export function refreshAccessToken(refreshToken: string): Promise<TrueLayerTokenResponse> {
  const { clientId, clientSecret } = getEnv();
  return postTokenEndpoint(new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
  }));
}
