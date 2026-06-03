export type PillLevel = 'green' | 'amber' | 'red' | 'none';
export type Bucket = 'needs' | 'wants' | 'savings';

export function pillStatus(
  amountPence: number,
  goalPence: number,
  bucket: Bucket,
): PillLevel {
  if (goalPence === 0) {
    // A goal of 0 disables the bucket — there is no budget to measure against,
    // so the pill carries no status colour ('none') regardless of amount.
    return 'none';
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
