import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { formatNGN } from '../format';
import { CountUp } from './CountUp';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('CountUp', () => {
  it('shows the final figure at once with reduced motion', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('prefers-reduced-motion'),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
    render(<CountUp value={49027} format={formatNGN} />);
    expect(screen.getByText('₦49,027')).toBeInTheDocument();
  });

  it('shows the final figure when IntersectionObserver never fires', () => {
    vi.stubGlobal('matchMedia', () => ({
      matches: false,
      media: '',
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
    render(<CountUp value={86256} format={formatNGN} />);
    expect(screen.getByText('₦86,256')).toBeInTheDocument();
  });
});
