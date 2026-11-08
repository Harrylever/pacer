"use client";

import { Fragment, type ReactNode } from "react";
import { LazyMotion, domAnimation, m } from "motion/react";

/**
 * The hero's load sequence. This is the only place Motion is used (with the
 * chat's CSS timeline). Elements start hidden in the server HTML and are
 * revealed here; `.hero-pre` in globals.css guarantees they can never stay
 * hidden (no JavaScript, reduced motion, or a failed chunk).
 *
 * Timeline (ms): headline words 250 to 850, text and buttons 750 to 1150,
 * phone 900 to 1500. The track and the chat run on CSS.
 */
const EASE_OUT = [0.22, 1, 0.36, 1] as const;

export function HeroMotion({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={domAnimation} strict>
      {children}
    </LazyMotion>
  );
}

export function HeroHeadline({
  words,
  emphasis,
}: {
  words: string[];
  emphasis: string;
}) {
  const item = (i: number) => ({
    initial: { opacity: 0, y: 24 },
    animate: { opacity: 1, y: 0 },
    transition: { delay: 0.25 + i * 0.09, duration: 0.6, ease: EASE_OUT },
  });
  return (
    <h1 className="hero-title">
      {words.map((word, i) => (
        <Fragment key={word + i}>
          <m.span className="hero-pre inline-block" {...item(i)}>
            {word}
          </m.span>{" "}
        </Fragment>
      ))}
      <m.em className="hero-pre inline-block italic text-mint" {...item(words.length)}>
        {emphasis}
      </m.em>
    </h1>
  );
}

export function FadeUp({
  delay,
  children,
  className = "",
}: {
  delay: number;
  children: ReactNode;
  className?: string;
}) {
  return (
    <m.div
      className={`hero-pre ${className}`}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.5, ease: EASE_OUT }}
    >
      {children}
    </m.div>
  );
}

export function PhoneRise({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <m.div
      className={`hero-pre ${className}`}
      initial={{ opacity: 0, y: 40 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        delay: 0.9,
        type: "spring",
        stiffness: 150,
        damping: 24,
        opacity: { delay: 0.9, duration: 0.4 },
      }}
    >
      {children}
    </m.div>
  );
}
