// Copied from ../lander/components/engraving/LaneDivider.tsx (M2), token colours inline.
/** Three thin parallel arcs, a lane-line divider under the header. No moving dot. */
export function LaneDivider({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 1200 48"
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
      className={className ? `${className} lane-divider` : 'lane-divider'}
    >
      <g fill="none" className="lane-lines" strokeWidth={1}>
        {[0, 9, 18].map((dy) => (
          <path key={dy} d={`M0 ${34 + dy} Q600 ${-30 + dy} 1200 ${34 + dy}`} />
        ))}
      </g>
    </svg>
  );
}
