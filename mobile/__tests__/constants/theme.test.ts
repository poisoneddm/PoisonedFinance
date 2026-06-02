import { colors, spacing, radius } from '@/constants/theme';

const requiredColors = [
  'bg', 'surface', 'card', 'border',
  'text', 'textMuted', 'textDim',
  'purple', 'purpleLight', 'purpleDim',
  'needs', 'wants', 'savings',
  'green', 'amber', 'red',
  'pillGreenBg', 'pillAmberBg', 'pillRedBg',
] as const;

describe('colors', () => {
  it.each(requiredColors)('has %s defined as a hex string', (key) => {
    expect(colors[key]).toMatch(/^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/);
  });
});

describe('spacing', () => {
  it('is monotonically increasing xs → xl', () => {
    expect(spacing.xs).toBeLessThan(spacing.sm);
    expect(spacing.sm).toBeLessThan(spacing.md);
    expect(spacing.md).toBeLessThan(spacing.lg);
    expect(spacing.lg).toBeLessThan(spacing.xl);
  });
});

describe('radius', () => {
  it('has sm < md < lg and round > 100', () => {
    expect(radius.sm).toBeLessThan(radius.md);
    expect(radius.md).toBeLessThan(radius.lg);
    expect(radius.round).toBeGreaterThan(100);
  });
});
