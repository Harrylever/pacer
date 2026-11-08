"use client";

import {
  useCallback,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from "react";

/**
 * Wraps the three steps. Tracks how far the visitor has scrolled through
 * them and exposes the active step (0, 1 or 2) as data-active and --active,
 * which CSS uses to glide the amber pace dot to that step.
 */
export function Staircase({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  const subscribe = useCallback((onChange: () => void) => {
    window.addEventListener("scroll", onChange, { passive: true });
    window.addEventListener("resize", onChange);
    return () => {
      window.removeEventListener("scroll", onChange);
      window.removeEventListener("resize", onChange);
    };
  }, []);

  const active = useSyncExternalStore(
    subscribe,
    () => {
      const el = ref.current;
      if (!el) return 0;
      const rect = el.getBoundingClientRect();
      const progress =
        (window.innerHeight * 0.6 - rect.top) / (rect.height * 0.9);
      return Math.min(2, Math.max(0, Math.floor(progress * 3)));
    },
    () => 0,
  );

  return (
    <div
      ref={ref}
      className={`stairs relative ${className}`}
      data-active={active}
      style={{ "--active": active } as React.CSSProperties}
    >
      <span className="stair-dot" aria-hidden="true" />
      {children}
    </div>
  );
}
