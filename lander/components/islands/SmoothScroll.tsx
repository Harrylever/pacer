"use client";

import { useEffect } from "react";
import Lenis from "lenis";
import { prefersReducedMotion } from "@/lib/motion-pref";
import { LENIS_OPTIONS, setLenis } from "@/lib/smooth-scroll";

/**
 * Starts Lenis smooth scrolling once the page is interactive. With reduced
 * motion it never starts, so scrolling stays fully native. Renders nothing.
 */
export function SmoothScroll() {
  useEffect(() => {
    if (prefersReducedMotion()) return;
    const lenis = new Lenis(LENIS_OPTIONS);
    setLenis(lenis);
    return () => {
      setLenis(null);
      lenis.destroy();
    };
  }, []);
  return null;
}
