const API_BASE = 'https://api.truelayer.com';

export async function fetchTrueLayer<T>(path: string, accessToken: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`TrueLayer API ${res.status}: ${body}`);
  }
  return res.json() as Promise<T>;
}
