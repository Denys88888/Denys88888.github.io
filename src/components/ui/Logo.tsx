// The app's mark: a yellow taxi on green, the same file the home-screen icon
// is rendered from (public/icons/logo.svg, see scripts/make-icons.mjs). An
// image rather than inline shapes now that the drawing has gradients and a
// shadow — one source, so the splash, sign-in and icon cannot drift apart.
export function Logo({ size = 48, className }: { size?: number; className?: string }) {
  return (
    <img
      src={`${import.meta.env.BASE_URL}icons/logo.svg`}
      width={size}
      height={size}
      alt="Taxi Pro"
      className={className}
      draggable={false}
    />
  );
}
