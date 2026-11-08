import type { ReactNode } from "react";

const STYLES = {
  primary: {
    dark: "bg-mint text-primary-deep hover:brightness-105",
    paper: "bg-primary text-on-primary hover:brightness-110",
  },
  secondary: {
    dark: "border border-dark-ink/35 text-dark-ink hover:bg-dark-ink/10",
    paper: "border border-border-control text-ink hover:bg-ink/5",
  },
} as const;

/** A pill link. Always at least 44 px tall; presses in slightly when tapped. */
export function Button({
  href,
  variant,
  ground,
  children,
  className = "",
}: {
  href: string;
  variant: "primary" | "secondary";
  ground: "paper" | "dark";
  children: ReactNode;
  className?: string;
}) {
  const external = href.startsWith("http");
  return (
    <a
      href={href}
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      className={`inline-flex min-h-11 items-center justify-center gap-2 whitespace-nowrap rounded-full px-5 text-[15px] font-medium transition duration-150 active:scale-[0.98] ${STYLES[variant][ground]} ${className}`}
    >
      {children}
    </a>
  );
}
