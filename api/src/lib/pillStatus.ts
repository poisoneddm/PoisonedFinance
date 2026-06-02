export type PillLevel = 'green' | 'amber' | 'red';
export type Bucket = 'needs' | 'wants' | 'savings';

export function pillStatus(
  amountPence: number,
  goalPence: number,
  bucket: Bucket,
): PillLevel {
  if (goalPence === 0) {
    // No goal set. For savings there is no target to fall short of, so any
    // outcome is green. For needs/wants, any spend with no budget is "over"
    // (red); zero spend is green.
    if (bucket === 'savings') return 'green';
    return amountPence > 0 ? 'red' : 'green';
  }

  const ratio = amountPence / goalPence;

  if (bucket === 'needs' || bucket === 'wants') {
    if (ratio < 0.5) return 'green';
    if (ratio < 1.0) return 'amber';
    return 'red';
  }

  // savings — reversed
  if (ratio >= 0.9) return 'green';
  if (ratio >= 0.5) return 'amber';
  return 'red';
}
