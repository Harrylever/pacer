/** Three thin parallel arcs, a lane-line divider between sections. */
export function LaneDivider({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 1200 48"
      preserveAspectRatio="none"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <g fill="none" className="stroke-divider" strokeWidth={1}>
        {[0, 9, 18].map((dy) => (
          <path key={dy} d={`M0 ${34 + dy} Q600 ${-30 + dy} 1200 ${34 + dy}`} />
        ))}
      </g>
    </svg>
  );
}
