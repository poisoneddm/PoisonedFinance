import { SEED_USER_ID } from '@/lib/currentUser';

describe('SEED_USER_ID', () => {
  it('is the fixed UUID from contracts §1', () => {
    expect(SEED_USER_ID).toBe('00000000-0000-0000-0000-000000000001');
  });
});
