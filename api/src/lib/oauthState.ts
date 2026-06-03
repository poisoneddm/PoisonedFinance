import crypto from 'crypto';

/**
 * Server-side store of issued OAuth `state` nonces for CSRF protection.
 *
 * The TrueLayer consent flow round-trips a `state` value. We bind a random,
 * single-use nonce to the initiating userId here so that:
 *   - the callback can verify the flow was started by this server (CSRF), and
 *   - the userId is taken from this store, never from the attacker-controllable
 *     state string.
 *
 * MVP single-process in-memory store; entries expire after TTL and are
 * one-time-use.
 */
interface Entry {
  userId: string;
  expiresAt: number;
}

const TTL_MS = 10 * 60 * 1000; // 10 minutes
const store = new Map<string, Entry>();

function sweep(now: number): void {
  for (const [nonce, entry] of store) {
    if (now > entry.expiresAt) store.delete(nonce);
  }
}

/** Issue a new state for the given userId and return the `userId:nonce` string. */
export function issueState(userId: string): string {
  const now = Date.now();
  sweep(now);
  const nonce = crypto.randomBytes(16).toString('hex');
  store.set(nonce, { userId, expiresAt: now + TTL_MS });
  return `${userId}:${nonce}`;
}

/**
 * Validate and consume a state string. Returns the bound userId (from the store,
 * NOT from the state string) or null if unknown, expired, or already used.
 */
export function consumeState(state: string): string | null {
  const nonce = state.split(':')[1];
  if (!nonce) return null;

  const entry = store.get(nonce);
  if (!entry) return null;

  store.delete(nonce); // single-use
  if (Date.now() > entry.expiresAt) return null;

  return entry.userId;
}
