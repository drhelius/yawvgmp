import { describe, expect, it } from 'vitest';
import { clamp, formatClock, formatTime, hasSupportedExtension } from './utils';

describe('player utilities', () => {
  it('accepts VGM and VGZ names case-insensitively', () => {
    expect(hasSupportedExtension('track.vgm')).toBe(true);
    expect(hasSupportedExtension('TRACK.VGZ')).toBe(true);
    expect(hasSupportedExtension('track.zip')).toBe(false);
  });

  it('formats short and long durations', () => {
    expect(formatTime(65.9)).toBe('1:05');
    expect(formatTime(3661)).toBe('1:01:01');
    expect(formatTime(Number.NaN)).toBe('0:00');
  });

  it('formats chip clocks and clamps controls', () => {
    expect(formatClock(3_579_545)).toBe('3.580 MHz');
    expect(clamp(12, 0, 10)).toBe(10);
  });
});
