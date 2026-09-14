/**
 * Purely decorative corner art for the desktop (lg+) auth screens — a
 * globe-and-leaf sketch bottom-left, a skyline bottom-right. Absolutely
 * positioned inside a `relative overflow-hidden` ancestor; never rendered
 * below the `lg` breakpoint. The recycle mark and word-stack live in the
 * in-flow right column instead (see AuthLayout), not here.
 */
export function DesktopDecor() {
  return (
    <div className="pointer-events-none absolute inset-0 z-0 hidden lg:block" aria-hidden="true">
      <svg
        className="absolute bottom-10 left-10 h-56 w-56 text-board/10"
        viewBox="0 0 200 200"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
      >
        <circle cx="90" cy="110" r="55" />
        <path d="M35 110h110M90 55v110M52 72c26 15 60 15 76 0M52 148c26-15 60-15 76 0" />
        <path d="M60 40c-18 4-30 20-28 40 16-2 30-10 36-24 4-10 0-18-8-16Z" fill="currentColor" stroke="none" opacity="0.7" />
        <path d="M30 60c-14 8-20 24-14 42 14-6 24-16 26-30 2-9-4-16-12-12Z" fill="currentColor" stroke="none" opacity="0.5" />
      </svg>

      <svg
        className="absolute bottom-0 right-0 h-48 w-80 text-board/10"
        viewBox="0 0 320 140"
        fill="currentColor"
      >
        <rect x="10" y="60" width="34" height="80" />
        <rect x="52" y="30" width="30" height="110" />
        <rect x="90" y="70" width="26" height="70" />
        <rect x="124" y="10" width="36" height="130" />
        <rect x="168" y="50" width="28" height="90" />
        <rect x="204" y="35" width="32" height="105" />
        <rect x="244" y="65" width="26" height="75" />
        <rect x="278" y="20" width="30" height="120" />
      </svg>
    </div>
  )
}
