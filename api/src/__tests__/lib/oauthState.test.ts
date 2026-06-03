import { issueState, consumeState } from '@/lib/oauthState';

describe('oauthState', () => {
  it('issues a state that consumes back to the same userId', () => {
    const state = issueState('user-1');
    expect(consumeState(state)).toBe('user-1');
  });

  it('derives userId from the server-side store, not the raw state string', () => {
    const state = issueState('real-user');
    // Tamper with the userId portion of the state — the stored nonce still maps
    // to the original user, so an attacker cannot inject an arbitrary userId.
    const nonce = state.split(':')[1];
    const tampered = `attacker:${nonce}`;
    expect(consumeState(tampered)).toBe('real-user');
  });

  it('is single-use — a state cannot be consumed twice', () => {
    const state = issueState('user-1');
    expect(consumeState(state)).toBe('user-1');
    expect(consumeState(state)).toBeNull();
  });

  it('returns null for an unknown / never-issued state', () => {
    expect(consumeState('user-1:deadbeefdeadbeef')).toBeNull();
  });

  it('returns null for a malformed state with no nonce', () => {
    expect(consumeState('user-1')).toBeNull();
  });

  it('returns null for an expired state', () => {
    const realNow = Date.now;
    try {
      const base = 1_000_000_000_000;
      Date.now = () => base;
      const state = issueState('user-1');
      // Advance beyond the 10-minute TTL.
      Date.now = () => base + 11 * 60 * 1000;
      expect(consumeState(state)).toBeNull();
    } finally {
      Date.now = realNow;
    }
  });
});
