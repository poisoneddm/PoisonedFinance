import { statusColors, StatusColorResult } from '../statusColors';
import { PillLevel } from '../types';

describe('statusColors', () => {
  it('green → dark green background and light green text', () => {
    const result: StatusColorResult = statusColors('green');
    expect(result.bg).toBe('#0d2e1a');
    expect(result.text).toBe('#4ade80');
  });

  it('amber → dark amber background and light amber text', () => {
    const result: StatusColorResult = statusColors('amber');
    expect(result.bg).toBe('#2d2208');
    expect(result.text).toBe('#fbbf24');
  });

  it('red → dark red background and light red text', () => {
    const result: StatusColorResult = statusColors('red');
    expect(result.bg).toBe('#2d0a0a');
    expect(result.text).toBe('#f87171');
  });

  it('none → neutral (disabled) background and muted text', () => {
    const result: StatusColorResult = statusColors('none');
    // A disabled goal carries no status colour — neutral surface + muted text.
    expect(result.bg).toBe('#16161e');
    expect(result.text).toBe('#888888');
  });

  it('returns a result with bg and text hex strings for all PillLevel values', () => {
    const levels: PillLevel[] = ['green', 'amber', 'red', 'none'];
    for (const level of levels) {
      const result = statusColors(level);
      expect(result).toHaveProperty('bg');
      expect(result).toHaveProperty('text');
      expect(result.bg).toMatch(/^#[0-9a-f]{6}$/);
      expect(result.text).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
});
