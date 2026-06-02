import { formatPence, formatPenceShort } from '../format';

describe('formatPence', () => {
  it('formats integer pence as £X,XXX.XX', () => {
    expect(formatPence(123456)).toBe('£1,234.56');
  });

  it('formats zero correctly', () => {
    expect(formatPence(0)).toBe('£0.00');
  });

  it('formats single pence (1p)', () => {
    expect(formatPence(1)).toBe('£0.01');
  });

  it('formats exactly 100p as £1.00', () => {
    expect(formatPence(100)).toBe('£1.00');
  });

  it('formats large amount with commas', () => {
    expect(formatPence(1000000)).toBe('£10,000.00');
  });

  it('formats negative pence (debit) with minus sign', () => {
    expect(formatPence(-3450)).toBe('-£34.50');
  });

  it('formats negative zero as £0.00 (no -£0.00)', () => {
    // Math.abs(0) === 0 so sign check passes through as positive
    expect(formatPence(-0)).toBe('£0.00');
  });
});

describe('formatPenceShort', () => {
  it('formats pence rounding to nearest pound, no decimals', () => {
    expect(formatPenceShort(123456)).toBe('£1,235');
  });

  it('formats zero as £0', () => {
    expect(formatPenceShort(0)).toBe('£0');
  });

  it('truncates (floors) — 99p rounds up at 50p', () => {
    expect(formatPenceShort(150)).toBe('£2');
  });

  it('formats £1,234 for 123400 pence', () => {
    expect(formatPenceShort(123400)).toBe('£1,234');
  });

  it('formats negative amounts', () => {
    expect(formatPenceShort(-3450)).toBe('-£35');
  });
});
