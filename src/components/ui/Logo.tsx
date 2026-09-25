// The app's mark: π, for the currency every fare is paid in. Drawn rather than
// imported as an image so it stays sharp at any size and takes its colour from
// whatever it sits on.
//
// It was a taxi first — a roof lamp above the crossbar, a road beneath it — and
// on the splash screen that read as a waste bin, lid and all. A plain π with a
// thin bar and long, well-spaced legs cannot close into a container shape.
//
// Keep in sync with scripts/make-icons.mjs, which draws the same shapes onto a
// green tile to produce the home-screen and browser-tab icons. Before this, the
// splash and login screens showed a stock car glyph that had nothing to do with
// the icon a driver sees on their home screen.
export function Logo({ size = 48, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="136 151 240 210"
      className={className}
      role="img"
      aria-label="Taxi Pro"
      fill="currentColor"
    >
      {/* crossbar */}
      <rect x="146" y="161" width="220" height="30" rx="15" />
      {/* legs */}
      <rect x="184" y="191" width="32" height="160" rx="16" />
      <rect x="296" y="191" width="32" height="160" rx="16" />
    </svg>
  );
}
