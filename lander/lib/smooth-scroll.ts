import type Lenis from "lenis";
import type { LenisOptions } from "lenis";

/**
 * Lenis smooth scrolling for wheel and trackpad. Touch keeps the phone's
 * own scrolling (syncTouch off). Anchor links scroll smoothly; Lenis honours
 * each section's CSS `scroll-margin-top`, so the gap under the sticky bar
 * has one source of truth (globals.css) for both Lenis and the native jump.
 */
export const LENIS_OPTIONS = {
  lerp: 0.1,
  smoothWheel: true,
  syncTouch: false,
  anchors: true,
  stopInertiaOnNavigate: true,
  autoRaf: true,
  respectReducedMotion: true,
} satisfies LenisOptions;

// The running instance, so other islands (the menu sheet) can pause it.
let current: Lenis | null = null;

export function setLenis(lenis: Lenis | null): void {
  current = lenis;
}

/** The running Lenis, or null (reduced motion, not yet started, or no JS). */
export function getLenis(): Lenis | null {
  return current;
}
