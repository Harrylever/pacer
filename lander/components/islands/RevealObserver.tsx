"use client";

import { useEffect } from "react";

/**
 * Scroll reveals. Elements marked data-reveal fade and rise once as they
 * come into view. Content is only hidden after this island arms the page
 * (the .reveal-ready class), so without JavaScript everything stays visible.
 * Whatever is already in view when it arms is shown straight away, so
 * nothing flashes. Reduced motion is handled in CSS.
 */
export function RevealObserver() {
  useEffect(() => {
    const targets = document.querySelectorAll<HTMLElement>("[data-reveal]");
    for (const el of targets) {
      if (el.getBoundingClientRect().top < window.innerHeight) {
        el.setAttribute("data-revealed", "");
      }
    }
    document.documentElement.classList.add("reveal-ready");

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.setAttribute("data-revealed", "");
            observer.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.15 },
    );
    for (const el of targets) {
      if (!el.hasAttribute("data-revealed")) observer.observe(el);
    }
    return () => observer.disconnect();
  }, []);

  return null;
}
