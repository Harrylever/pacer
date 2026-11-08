import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

/** Renders a server component tree to an HTML string for markup assertions. */
export function html(node: ReactElement): string {
  return renderToStaticMarkup(node);
}
