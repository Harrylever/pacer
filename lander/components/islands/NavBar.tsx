"use client";

import Image from "next/image";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/Button";
import { getLenis } from "@/lib/smooth-scroll";

type Link = { label: string; href: string };
type Labels = {
  cta: string;
  ctaShort: string;
  openMenu: string;
  closeMenu: string;
};

const SCROLL_AT = 24;

function subscribeToScroll(onChange: () => void): () => void {
  window.addEventListener("scroll", onChange, { passive: true });
  return () => window.removeEventListener("scroll", onChange);
}

/** True once the page has scrolled past the top of the hero. */
function useScrolled(): boolean {
  return useSyncExternalStore(
    subscribeToScroll,
    () => window.scrollY > SCROLL_AT,
    () => false,
  );
}

export function NavBar({
  links,
  botHref,
  labels,
}: {
  links: Link[];
  botHref: string;
  labels: Labels;
}) {
  const scrolled = useScrolled();
  const [open, setOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const sheet = useRef<HTMLDivElement>(null);
  const wasOpen = useRef(false);

  // Focus moves into the sheet when it opens and back to the button when it closes.
  useEffect(() => {
    if (open) closeButton.current?.focus();
    else if (wasOpen.current) menuButton.current?.focus();
    wasOpen.current = open;
  }, [open]);

  // While the sheet is open: lock page scroll (native and Lenis), Escape
  // closes, Tab stays inside.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    getLenis()?.stop();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        return;
      }
      if (event.key !== "Tab" || !sheet.current) return;
      const focusable =
        sheet.current.querySelectorAll<HTMLElement>("a[href], button");
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      getLenis()?.start();
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // A link in the sheet closes it and goes to its section. Lenis is paused
  // while the sheet is open, so start it and scroll explicitly; without
  // Lenis (reduced motion) the browser's own anchor jump does the work.
  const goTo = (event: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    setOpen(false);
    const lenis = getLenis();
    if (!lenis) return;
    event.preventDefault();
    // Wait until the sheet has closed and the page scrollbar is back: the
    // scrollbar changes the text width, which moves the target. Measuring
    // earlier lands the heading about 18 px low.
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        lenis.start();
        lenis.scrollTo(href); // honours the section's scroll-margin-top
      }),
    );
  };

  return (
    <>
      <header className="site-nav" data-scrolled={scrolled ? "" : undefined}>
        <div className="mx-auto flex h-16 max-w-[1200px] items-center gap-6 px-4 md:px-8 lg:px-14">
          <a
            href="#main"
            className="flex min-h-11 min-w-11 items-center"
            aria-label="Pacer, back to top"
          >
            <Image
              src="/brand/pacer-mark.svg"
              alt=""
              width={36}
              height={36}
              unoptimized
              className="sm:hidden"
            />
            <Image
              src="/brand/pacer-lockup-dark.svg"
              alt="Pacer"
              width={108}
              height={36}
              unoptimized
              className="nav-logo-dark hidden sm:block"
            />
            <Image
              src="/brand/pacer-lockup.svg"
              alt="Pacer"
              width={108}
              height={36}
              unoptimized
              className="nav-logo-light hidden"
            />
          </a>

          <nav
            aria-label="Main"
            className="ml-auto hidden items-center gap-7 text-[15px] md:flex"
          >
            {links.map((link) => (
              <a key={link.href} href={link.href} className="nav-link py-3">
                {link.label}
              </a>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2 md:ml-0">
            <Button
              href={botHref}
              variant="primary"
              ground={scrolled ? "paper" : "dark"}
            >
              <span className="md:hidden">{labels.ctaShort}</span>
              <span className="hidden md:inline">{labels.cta}</span>
            </Button>
            <button
              ref={menuButton}
              type="button"
              className="nav-menu-button md:hidden"
              aria-expanded={open}
              aria-controls="menu-sheet"
              aria-label={labels.openMenu}
              onClick={() => setOpen(true)}
            >
              <span aria-hidden="true" className="nav-menu-bars" />
            </button>
          </div>
        </div>
      </header>

      {/* Outside the header: its backdrop-filter would otherwise trap this fixed sheet. */}
      <div
        ref={sheet}
        id="menu-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="Menu"
        hidden={!open}
        className="ground-dark fixed inset-0 z-50 flex flex-col px-4 md:hidden"
      >
        <div className="flex h-16 items-center justify-between">
          <Image
            src="/brand/pacer-lockup-dark.svg"
            alt="Pacer"
            width={108}
            height={36}
            unoptimized
          />
          <button
            ref={closeButton}
            type="button"
            className="nav-menu-button"
            aria-label={labels.closeMenu}
            onClick={() => setOpen(false)}
          >
            <span aria-hidden="true" className="nav-menu-close" />
          </button>
        </div>
        <ul className="mt-10 flex flex-col gap-2">
          {links.map((link, i) => (
            <li
              key={link.href}
              className="menu-rise"
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <a
                href={link.href}
                onClick={(event) => goTo(event, link.href)}
                className="block py-3 font-display text-5xl font-light tracking-tight"
              >
                {link.label}
              </a>
            </li>
          ))}
        </ul>
        <div
          className="menu-rise mt-auto pb-8"
          style={{ animationDelay: `${links.length * 60}ms` }}
        >
          <Button
            href={botHref}
            variant="primary"
            ground="dark"
            className="w-full"
          >
            {labels.cta}
          </Button>
        </div>
      </div>
    </>
  );
}
