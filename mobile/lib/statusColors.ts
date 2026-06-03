import { PillLevel } from './types';

export interface StatusColorResult {
  /** Hex colour for background (usable as React Native backgroundColor) */
  bg: string;
  /** Hex colour for text */
  text: string;
}

/**
 * Maps a PillLevel to hex colour values per §7:
 *   green → bg #0d2e1a (dark green), text #4ade80 (light green)
 *   amber → bg #2d2208 (dark amber), text #fbbf24 (light amber)
 *   red   → bg #2d0a0a (dark red),   text #f87171 (light red)
 *   none  → bg #16161e (neutral surface), text #888888 (muted) — goal disabled
 */
export function statusColors(level: PillLevel): StatusColorResult {
  switch (level) {
    case 'green':
      return { bg: '#0d2e1a', text: '#4ade80' };
    case 'amber':
      return { bg: '#2d2208', text: '#fbbf24' };
    case 'red':
      return { bg: '#2d0a0a', text: '#f87171' };
    case 'none':
      return { bg: '#16161e', text: '#888888' };
  }
}
