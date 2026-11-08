import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// jsdom has no IntersectionObserver; CountUp then simply shows final values.
class NoopIntersectionObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
globalThis.IntersectionObserver =
  globalThis.IntersectionObserver ??
  (NoopIntersectionObserver as unknown as typeof IntersectionObserver);

afterEach(() => {
  cleanup();
});
