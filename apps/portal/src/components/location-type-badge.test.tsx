import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LocationTypeBadge, readableTextColor } from './location-type-badge';

describe('LocationTypeBadge', () => {
  it('renders a dash placeholder when no type is given', () => {
    const { container } = render(<LocationTypeBadge locationType={null} />);
    expect(container.textContent).toBe('—');
    expect(screen.queryByText('Woning')).not.toBeInTheDocument();
  });

  it('renders the type name', () => {
    render(<LocationTypeBadge locationType={{ name: 'Woning', color: '#2563EB' }} />);
    expect(screen.getByText('Woning')).toBeInTheDocument();
  });

  it('renders a neutral grey pill for a type without a color', () => {
    render(<LocationTypeBadge locationType={{ name: 'Overig', color: null }} />);
    const pill = screen.getByText('Overig');
    expect(pill).toBeInTheDocument();
    expect(pill.className).toContain('bg-gray-100');
  });

  it('uses the hex color as background', () => {
    render(<LocationTypeBadge locationType={{ name: 'Kantoor', color: '#7C3AED' }} />);
    const pill = screen.getByText('Kantoor');
    // jsdom normalises hex to rgb()
    expect(pill.style.backgroundColor).toBe('rgb(124, 58, 237)');
  });

  it('picks white text on a dark background and dark text on a light background', () => {
    // Dark background → light (white) text
    render(<LocationTypeBadge locationType={{ name: 'Donker', color: '#1E3A8A' }} />);
    const dark = screen.getByText('Donker');
    expect(dark.style.color).toBe('rgb(255, 255, 255)');

    // Light background → dark text
    render(<LocationTypeBadge locationType={{ name: 'Licht', color: '#FEF08A' }} />);
    const light = screen.getByText('Licht');
    expect(light.style.color).toBe('rgb(17, 24, 39)');
  });

  it('readableTextColor returns white for black and dark for white', () => {
    expect(readableTextColor('#000000')).toBe('#ffffff');
    expect(readableTextColor('#ffffff')).toBe('#111827');
  });
});
