/** The most the phone ever turns, in degrees. Slight on purpose. */
export const MAX_TILT_DEG = 5;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

/**
 * How far to turn the phone so its face looks towards the pointer.
 * The pointer's offset from the phone's centre is measured against half the
 * viewport, so the phone reaches the maximum only when the pointer is at
 * the far edge of the window. Positive rotateY turns the face right;
 * positive rotateX turns it up.
 */
export function tiltFor(
  pointer: { x: number; y: number },
  center: { x: number; y: number },
  viewport: { width: number; height: number },
  max = MAX_TILT_DEG,
): { rx: number; ry: number } {
  const nx =
    viewport.width > 0
      ? clamp((pointer.x - center.x) / (viewport.width / 2), -1, 1)
      : 0;
  const ny =
    viewport.height > 0
      ? clamp((pointer.y - center.y) / (viewport.height / 2), -1, 1)
      : 0;
  // "+ 0" turns -0 into 0
  return { rx: -ny * max + 0, ry: nx * max + 0 };
}
