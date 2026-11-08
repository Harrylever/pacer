"use client";

import { Fragment, type CSSProperties, type ReactNode } from "react";

/**
 * The hero's load sequence, in CSS (globals.css `.hero-rise`): headline
 * words 250 to 850 ms, text and buttons 750 to 1150, phone 900 to 1500.
 * It used to run on the `motion` package; CSS does the same work for no
 * JavaScript, so the library left the bundle. Elements carry `.hero-pre`,
 * whose safety net can never let them stay hidden (no JavaScript,
 * reduced motion, or a failed chunk): CSS animation needs no JS at all,
 * and reduced motion shows everything at once.
 */

export function HeroMotion({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

export function HeroHeadline({
  words,
  emphasis,
}: {
  words: string[];
  emphasis: string;
}) {
  const delay = (i: number) =>
    ({ "--hero-delay": `${250 + i * 90}ms` }) as CSSProperties;
  return (
    <h1 className="hero-title">
      {words.map((word, i) => (
        <Fragment key={word + i}>
          <span className="hero-pre hero-rise inline-block" style={delay(i)}>
            {word}
          </span>{" "}
        </Fragment>
      ))}
      <em
        className="hero-pre hero-rise inline-block italic text-mint"
        style={delay(words.length)}
      >
        {emphasis}
      </em>
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
    <div
      className={`hero-pre hero-rise ${className}`}
      style={{ "--hero-delay": `${Math.round(delay * 1000)}ms` } as CSSProperties}
    >
      {children}
    </div>
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
    <div
      className={`hero-pre hero-rise hero-phone ${className}`}
      style={{ "--hero-delay": "900ms" } as CSSProperties}
    >
      {children}
    </div>
  );
}
