"use client";

import { useEffect } from "react";
import type Lenis from "lenis";
import { prefersReducedMotion } from "@/lib/motion-pref";
import { LENIS_OPTIONS, setLenis } from "@/lib/smooth-scroll";

/**
 * Starts Lenis smooth scrolling once the page is interactive. With reduced
 * motion it never starts, so scrolling stays fully native. Renders nothing.
 */
export function SmoothScroll() {
  useEffect(() => {
    if (prefersReducedMotion()) return;
    let lenis: Lenis | null = null;
    let cancelled = false;
    // Loaded on demand: smooth scrolling is an enhancement, so Lenis stays
    // out of the first-load bundle and arrives as its own chunk.
    void import("lenis").then(({ default: LenisCtor }) => {
      if (cancelled) return;
      lenis = new LenisCtor(LENIS_OPTIONS);
      setLenis(lenis);
    });
    return () => {
      cancelled = true;
      setLenis(null);
      lenis?.destroy();
    };
  }, []);
  return null;
}
