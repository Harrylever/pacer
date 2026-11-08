"use client";

import { useEffect, useState } from "react";
import { prefersReducedMotion } from "@/lib/motion-pref";
import { getLenis } from "@/lib/smooth-scroll";

/** Show the button after roughly a screenful of scrolling. */
const SHOW_AFTER_PX = 600;

/**
 * Floating "back to top" button, fixed to the bottom corner once the
 * reader is well down the page. Scrolls through Lenis while it runs
 * (staying in step with its easing); with reduced motion Lenis never
 * starts and the native jump is instant instead of smooth.
 */
export function BackToTop() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > SHOW_AFTER_PX);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const toTop = () => {
    const lenis = getLenis();
    if (lenis) {
      lenis.scrollTo(0);
    } else {
      window.scrollTo({
        top: 0,
        behavior: prefersReducedMotion() ? "auto" : "smooth",
      });
    }
  };

  return (
    <button
      type="button"
      onClick={toTop}
      aria-label="Back to top"
      title="Back to top"
      aria-hidden={!visible}
      tabIndex={visible ? 0 : -1}
      className={`fixed right-5 bottom-5 z-50 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-on-primary shadow-lg motion-safe:transition motion-safe:duration-200 ${
        visible
          ? "opacity-100"
          : "pointer-events-none translate-y-2 opacity-0 motion-safe:translate-y-2"
      }`}
    >
      <svg
        viewBox="0 0 24 24"
        className="h-5 w-5"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        focusable="false"
      >
        <path d="M12 19V5" />
        <path d="m5 12 7-7 7 7" />
      </svg>
    </button>
  );
}
