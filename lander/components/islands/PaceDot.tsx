"use client";

import { useEffect, useRef } from "react";
import { usePrefersReducedMotion } from "@/lib/motion-pref";

type Point = { x: number; y: number };

const r1 = (v: number) => Math.round(v * 10) / 10;

/**
 * The amber pace dot. It rests where it is drawn and only moves when this
 * island starts it, so a page without JavaScript, or a visitor who asked
 * for reduced motion, sees a dot sitting still on the start line.
 *
 * loop:   laps the inner lane, 14 seconds a lap, constant speed, forever.
 * finish: runs the last quarter of a lap once (when the track scrolls into
 *         view) and stops on the finish line, at the same speed.
 */
export function PaceDot({
  path,
  start,
  restAt,
  mode,
  delayMs = 0,
}: {
  path: string;
  start: Point;
  restAt: Point;
  mode: "loop" | "finish";
  delayMs?: number;
}) {
  const reduced = usePrefersReducedMotion();
  const group = useRef<SVGGElement>(null);
  const motion = useRef<SVGAnimateMotionElement>(null);

  useEffect(() => {
    const anim = motion.current;
    if (reduced || !anim) return;
    if (mode === "loop") {
      const id = window.setTimeout(() => anim.beginElement(), delayMs);
      return () => window.clearTimeout(id);
    }
    const svg = group.current?.ownerSVGElement;
    if (!svg) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          anim.beginElement();
          observer.disconnect();
        }
      },
      { threshold: 0.4 },
    );
    observer.observe(svg);
    return () => observer.disconnect();
  }, [mode, delayMs, reduced]);

  // Reduced motion: the finish dot sits on the finish line instead.
  const at = reduced ? restAt : start;
  const cx = r1(at.x);
  const cy = r1(at.y);

  return (
    <g ref={group}>
      <circle cx={cx} cy={cy} r={16} className="fill-accent" opacity={0.16} />
      <circle cx={cx} cy={cy} r={7} className="fill-accent" />
      {!reduced &&
        (mode === "loop" ? (
          <animateMotion
            ref={motion}
            path={path}
            begin="indefinite"
            dur="14s"
            repeatCount="indefinite"
            calcMode="paced"
          />
        ) : (
          <animateMotion
            ref={motion}
            path={path}
            begin="indefinite"
            dur="3.5s"
            calcMode="paced"
            fill="freeze"
          />
        ))}
    </g>
  );
}
