import { copy, LINKS } from "@/content/landing";
import { NavBar } from "@/components/islands/NavBar";

/** The site navigation. Server wrapper; the scroll state and menu live in NavBar. */
export function Nav() {
  return (
    <NavBar links={copy.nav.links} botHref={LINKS.bot} labels={copy.nav} />
  );
}
