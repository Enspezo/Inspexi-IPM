import { describe, it, expect } from 'vitest';
import { readableTextColor } from './tag-pill';

describe('readableTextColor', () => {
  it('returns white text on dark backgrounds', () => {
    expect(readableTextColor('#1E40AF')).toBe('#ffffff');
    expect(readableTextColor('#000000')).toBe('#ffffff');
  });

  it('returns dark text on light backgrounds', () => {
    expect(readableTextColor('#FDE047')).toBe('#1f2937'); // light yellow
    expect(readableTextColor('#FFFFFF')).toBe('#1f2937');
  });

  it('tolerates a missing leading hash', () => {
    expect(readableTextColor('000000')).toBe('#ffffff');
  });

  it('falls back to white for invalid input', () => {
    expect(readableTextColor('rood')).toBe('#ffffff');
    expect(readableTextColor('')).toBe('#ffffff');
  });
});
