"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { prefersReducedMotion } from "@/lib/motion-pref";
import { tiltFor } from "@/lib/tilt";

const EASE = 0.1; // how quickly the phone follows the pointer, per frame
const SETTLED = 0.01; // degrees; below this the animation loop stops

/**
 * Turns its children slightly towards the mouse pointer, with smoothing.
 * Mouse and pen only: nothing happens on touch screens, with reduced
 * motion, or while the phone is off screen. Only transform is animated.
 */
export function TiltOnPointer({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  const stage = useRef<HTMLDivElement>(null);
  const tilt = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const stageEl = stage.current;
    const tiltEl = tilt.current;
    if (!stageEl || !tiltEl) return;
    if (prefersReducedMotion()) return;
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches)
      return;

    let target = { rx: 0, ry: 0 };
    const current = { rx: 0, ry: 0 };
    let frame = 0;
    let onScreen = false;

    const step = () => {
      current.rx += (target.rx - current.rx) * EASE;
      current.ry += (target.ry - current.ry) * EASE;
      tiltEl.style.transform = `rotateX(${current.rx.toFixed(2)}deg) rotateY(${current.ry.toFixed(2)}deg)`;
      const settled =
        Math.abs(target.rx - current.rx) < SETTLED &&
        Math.abs(target.ry - current.ry) < SETTLED;
      frame = settled ? 0 : requestAnimationFrame(step);
    };
    const kick = () => {
      if (!frame) frame = requestAnimationFrame(step);
    };
    const relax = () => {
      target = { rx: 0, ry: 0 };
      kick();
    };
    const onMove = (event: PointerEvent) => {
      if (!onScreen || event.pointerType === "touch") return;
      const rect = stageEl.getBoundingClientRect();
      target = tiltFor(
        { x: event.clientX, y: event.clientY },
        { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 },
        { width: window.innerWidth, height: window.innerHeight },
      );
      kick();
    };

    const observer = new IntersectionObserver(([entry]) => {
      onScreen = entry.isIntersecting;
      if (!onScreen) relax();
    });
    observer.observe(stageEl);
    window.addEventListener("pointermove", onMove, { passive: true });
    document.documentElement.addEventListener("pointerleave", relax);
    window.addEventListener("blur", relax);

    return () => {
      observer.disconnect();
      window.removeEventListener("pointermove", onMove);
      document.documentElement.removeEventListener("pointerleave", relax);
      window.removeEventListener("blur", relax);
      cancelAnimationFrame(frame);
      tiltEl.style.transform = "";
    };
  }, []);

  return (
    <div ref={stage} className={`tilt-stage ${className}`}>
      <div ref={tilt} className="tilt-inner">
        {children}
      </div>
    </div>
  );
}
