import type { ReactNode } from "react";

/**
 * A modern iPhone for product mockups, drawn by hand. Three concentric
 * layers keep the bezel an even width all the way round: a thin metal edge
 * (outer radius 52), the black bezel (49.5) and the screen (41.5). The
 * screen has a Dynamic Island, an iOS status bar (9:41, signal, Wi-Fi,
 * battery) centred on the island, and a home indicator. It shows Pacer's
 * own chat and chart, never another app's interface. All device chrome is
 * decorative and hidden from assistive tech.
 */

const SIDE_BUTTONS = [
  // [side, top, height]
  ["left", 84, 22], // action button
  ["left", 124, 40], // volume up
  ["left", 174, 40], // volume down
  ["right", 142, 66], // power
] as const;

function Signal() {
  return (
    <svg
      data-part="signal"
      aria-hidden="true"
      viewBox="0 0 17 11"
      width={13}
      height={8.4}
      fill="currentColor"
    >
      <rect x={0} y={7.5} width={3} height={3.5} rx={0.9} />
      <rect x={4.5} y={5} width={3} height={6} rx={0.9} />
      <rect x={9} y={2.5} width={3} height={8.5} rx={0.9} />
      <rect x={13.5} y={0} width={3} height={11} rx={0.9} />
    </svg>
  );
}

function Wifi() {
  return (
    <svg
      data-part="wifi"
      aria-hidden="true"
      viewBox="0 0 16 12"
      width={12}
      height={9}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
    >
      <path d="M1.4 4.1a9.2 9.2 0 0 1 13.2 0" />
      <path d="M3.8 6.7a5.8 5.8 0 0 1 8.4 0" />
      <path d="M6.1 9.2a2.5 2.5 0 0 1 3.8 0" />
    </svg>
  );
}

function Battery() {
  return (
    <svg
      data-part="battery"
      aria-hidden="true"
      viewBox="0 0 27 12"
      width={20}
      height={8.9}
    >
      <rect
        x={0.5}
        y={0.5}
        width={22}
        height={11}
        rx={3.6}
        fill="none"
        stroke="currentColor"
        strokeOpacity={0.4}
      />
      <rect x={2} y={2} width={19} height={8} rx={2.2} fill="currentColor" />
      <path
        d="M24.2 4v4a2 2 0 0 0 0-4Z"
        fill="currentColor"
        fillOpacity={0.45}
      />
    </svg>
  );
}

export function Phone({
  children,
  className = "",
  statusTone = "surface",
}: {
  children: ReactNode;
  className?: string;
  /** Match the status bar to the screen's top: paper, or white under a white header. */
  statusTone?: "surface" | "raised";
}) {
  return (
    <div
      className={`phone-frame relative rounded-[52px] p-[2.5px] shadow-[0_24px_60px_rgba(0,0,0,0.38)] ${className}`}
    >
      {SIDE_BUTTONS.map(([side, top, height]) => (
        <span
          key={`${side}-${top}`}
          data-part="side-button"
          aria-hidden="true"
          style={{ top, height }}
          className={`phone-button absolute w-[3px] ${
            side === "left"
              ? "-left-[2px] rounded-l-[2px]"
              : "-right-[2px] rounded-r-[2px]"
          }`}
        />
      ))}

      <div className="h-full rounded-[49.5px] bg-primary-deep p-2">
        <div className="relative flex h-full flex-col overflow-hidden rounded-[41.5px] bg-surface text-ink">
          <div
            data-part="status-bar"
            aria-hidden="true"
            className={`absolute inset-x-0 top-0 z-10 h-[50px] ${
              statusTone === "raised" ? "bg-surface-raised" : "bg-surface"
            }`}
          >
            <div className="absolute inset-x-0 top-[11px] flex h-[27px] items-center justify-between px-7 text-[12px] font-semibold leading-none tracking-tight">
              <span>9:41</span>
              <span className="flex items-center gap-[3px]">
                <Signal />
                <Wifi />
                <Battery />
              </span>
            </div>
          </div>
          <span
            data-part="island"
            aria-hidden="true"
            className="absolute left-1/2 top-[11px] z-20 h-[27px] w-[76px] -translate-x-1/2 rounded-full bg-primary-deep"
          >
            <span className="absolute right-[9px] top-1/2 size-[7px] -translate-y-1/2 rounded-full bg-dark-raised" />
          </span>

          <div className="flex min-h-0 flex-1 flex-col pb-7 pt-[50px]">
            {children}
          </div>

          <span
            data-part="home-indicator"
            aria-hidden="true"
            className="absolute bottom-[7px] left-1/2 z-10 h-1 w-[100px] -translate-x-1/2 rounded-full bg-ink"
          />
        </div>
      </div>
    </div>
  );
}
