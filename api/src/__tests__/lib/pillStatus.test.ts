import { pillStatus, PillLevel, Bucket } from '@/lib/pillStatus';

// Helper to assert clearly
function expect_status(
  amount: number,
  goal: number,
  bucket: Bucket,
  expected: PillLevel,
) {
  expect(pillStatus(amount, goal, bucket)).toBe(expected);
}

describe('pillStatus — needs bucket (lower is better)', () => {
  it('ratio exactly 0 → green', () => expect_status(0, 1000, 'needs', 'green'));
  it('ratio 0.49 → green (just below 50%)', () => expect_status(490, 1000, 'needs', 'green'));
  it('ratio 0.5 → amber (boundary — 50% is amber, not green)', () => expect_status(500, 1000, 'needs', 'amber'));
  it('ratio 0.99 → amber (just below 100%)', () => expect_status(990, 1000, 'needs', 'amber'));
  it('ratio 1.0 → red (100% is over)', () => expect_status(1000, 1000, 'needs', 'red'));
  it('ratio over 1.0 → red', () => expect_status(1500, 1000, 'needs', 'red'));
  it('goal=0 amount=0 → green (ratio=0)', () => expect_status(0, 0, 'needs', 'green'));
  it('goal=0 amount>0 → red (ratio=Infinity)', () => expect_status(1, 0, 'needs', 'red'));
});

describe('pillStatus — wants bucket (lower is better)', () => {
  it('ratio 0.49 → green', () => expect_status(490, 1000, 'wants', 'green'));
  it('ratio 0.5 → amber', () => expect_status(500, 1000, 'wants', 'amber'));
  it('ratio 0.99 → amber', () => expect_status(990, 1000, 'wants', 'amber'));
  it('ratio 1.0 → red', () => expect_status(1000, 1000, 'wants', 'red'));
  it('ratio over 1.0 → red', () => expect_status(2000, 1000, 'wants', 'red'));
  it('goal=0 amount=0 → green', () => expect_status(0, 0, 'wants', 'green'));
  it('goal=0 amount>0 → red', () => expect_status(50, 0, 'wants', 'red'));
});

describe('pillStatus — savings bucket (higher is better)', () => {
  it('ratio 0 → red', () => expect_status(0, 1000, 'savings', 'red'));
  it('ratio 0.49 → red (just below 50%)', () => expect_status(490, 1000, 'savings', 'red'));
  it('ratio 0.5 → amber (50% boundary — not red)', () => expect_status(500, 1000, 'savings', 'amber'));
  it('ratio 0.89 → amber (just below 90%)', () => expect_status(890, 1000, 'savings', 'amber'));
  it('ratio 0.9 → green (90% boundary)', () => expect_status(900, 1000, 'savings', 'green'));
  it('ratio over 0.9 → green', () => expect_status(1200, 1000, 'savings', 'green'));
  it('goal=0 amount=0 → green (ratio=0 treated as 0, savings 0/0 = no shortfall)', () => expect_status(0, 0, 'savings', 'green'));
  it('goal=0 amount>0 → green (Infinity ≥ 0.9)', () => expect_status(500, 0, 'savings', 'green'));
});
