import Image from "next/image"
import { copy, LINKS } from "@/content/landing"

export function Footer() {
  const { footer } = copy
  return (
    <footer className="ground-dark border-t border-dark-ink/15">
      <div className="mx-auto max-w-[1200px] px-4 py-14 md:px-8 lg:px-14">
        <div className="flex flex-col gap-10 md:flex-row md:items-start md:justify-between">
          <div>
            <Image
              src="/brand/pacer-lockup-dark.svg"
              alt="Pacer"
              width={126}
              height={42}
              unoptimized
            />
            <p className="mt-3 font-display text-[18px] font-[380] text-dark-muted">
              {footer.tagline}
            </p>
          </div>
          <ul className="flex flex-col gap-3 text-[15px]">
            <li>
              <a
                href={LINKS.bot}
                target="_blank"
                rel="noopener noreferrer"
                className="footer-link inline-flex min-h-11 items-center"
              >
                {footer.botLabel}
              </a>
            </li>
            <li>
              <a
                href={LINKS.github}
                target="_blank"
                rel="noopener noreferrer"
                className="footer-link inline-flex min-h-11 items-center"
              >
                {footer.githubLabel}
              </a>
            </li>
            <li>
              <a
                href={LINKS.demoVideo}
                target="_blank"
                rel="noopener noreferrer"
                className="footer-link inline-flex min-h-11 items-center"
              >
                {footer.demoLabel}
              </a>
            </li>
            <li>
              <a
                href="/privacy"
                className="footer-link inline-flex min-h-11 items-center"
              >
                {footer.privacyLabel}
              </a>
            </li>
          </ul>
        </div>
        <p className="mt-12 max-w-[72ch] text-[13px] leading-relaxed text-dark-muted">
          {footer.smallPrint}
        </p>
      </div>
    </footer>
  )
}
