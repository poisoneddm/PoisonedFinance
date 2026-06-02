/**
 * Typed HTTP helpers for the PoisonedFinance API. §13
 * Base URL read from EXPO_PUBLIC_API_URL environment variable.
 */

const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

async function request<T>(
  method: 'GET' | 'POST' | 'PUT',
  path: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${method} ${path} → ${res.status}: ${text}`);
  }

  return res.json() as Promise<T>;
}

export function apiGet<T>(path: string): Promise<T> {
  return request<T>('GET', path);
}

export function apiPost<T>(path: string, body: unknown): Promise<T> {
  return request<T>('POST', path, body);
}

export function apiPut<T>(path: string, body: unknown): Promise<T> {
  return request<T>('PUT', path, body);
}

/**
 * POST multipart/form-data to the API.
 * Do NOT set Content-Type manually — the browser/RN fetch implementation
 * injects the correct multipart boundary when body is a FormData instance.
 */
export async function apiUpload<T>(path: string, body: FormData): Promise<T> {
  // Reuse the module-level BASE_URL constant. EXPO_PUBLIC_* vars are inlined at
  // build time by babel-preset-expo, so reading process.env here at call time
  // would not reflect a runtime-set value — BASE_URL keeps all helpers consistent.
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}
