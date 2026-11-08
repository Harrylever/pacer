'use client';

// Copied from ../lander/components/islands/CountUp.tsx and adapted to take a
// formatter for the display currency (Pacer Mini App round 2, M3).

import { useEffect, useRef, useState } from 'react';
import { prefersReducedMotion } from '../lib/motion-pref';

const DURATION_MS = 800;

/**
 * Shows a figure. The rendered HTML holds the final value, so it is right
 * without JavaScript. The first time it scrolls into view it counts up from
 * zero over 800 ms (never with reduced motion). If the value changes while
 * counting, for example from scrubbing the chart, it jumps straight to it.
 */
export function CountUp({
  value,
  format,
  className,
}: {
  value: number;
  format: (n: number) => string;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [anim, setAnim] = useState<{ target: number; current: number } | null>(null);
  const done = useRef(false);
  const latest = useRef(value);

  useEffect(() => {
    latest.current = value;
  }, [value]);

  useEffect(() => {
    const el = ref.current;
    if (!el || prefersReducedMotion()) return;
    let frame = 0;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting || done.current) return;
        done.current = true;
        observer.disconnect();
        const target = latest.current;
        const startedAt = performance.now();
        const tick = (now: number) => {
          const t = Math.min(1, (now - startedAt) / DURATION_MS);
          const eased = 1 - (1 - t) ** 3;
          setAnim(t < 1 ? { target, current: target * eased } : null);
          if (t < 1) frame = requestAnimationFrame(tick);
        };
        setAnim({ target, current: 0 });
        frame = requestAnimationFrame(tick);
      },
      { threshold: 0 },
    );
    observer.observe(el);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, []);

  const shown = anim && anim.target === value ? anim.current : value;
  return (
    <span ref={ref} className={className}>
      {format(shown)}
    </span>
  );
}
