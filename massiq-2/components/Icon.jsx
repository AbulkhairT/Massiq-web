/**
 * SF Symbol-style SVG icon library
 * 24×24 viewBox · stroke-based · 1.5px default weight · rounded caps
 */

const S = (props, children) => ({
  ...props,
  viewBox: '0 0 24 24',
  fill: 'none',
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  children,
});

const ICONS = {
  /* ── Navigation ─────────────────────────────────────────── */
  home: (
    <>
      <path d="M3 12L12 4l9 8v8a1 1 0 01-1 1h-4v-5a1 1 0 00-1-1H9a1 1 0 00-1 1v5H4a1 1 0 01-1-1v-8z" />
    </>
  ),
  utensils: (
    <>
      <path d="M3 2v7c0 1.1.9 2 2 2s2-.9 2-2V2" />
      <line x1="5" y1="11" x2="5" y2="22" />
      <path d="M21 15V2a5 5 0 00-5 5v4h5" />
      <line x1="16" y1="15" x2="16" y2="22" />
    </>
  ),
  camera: (
    <>
      <rect x="2" y="7" width="20" height="14" rx="2" />
      <circle cx="12" cy="14" r="4" />
      <path d="M8 7l2-3h4l2 3" />
      <circle cx="18.5" cy="9.5" r=".5" fill="currentColor" />
    </>
  ),
  clipboard: (
    <>
      <rect x="5" y="3" width="14" height="18" rx="2" />
      <path d="M9 3a1 1 0 011-1h4a1 1 0 011 1v1H9V3z" />
      <line x1="9" y1="10" x2="15" y2="10" />
      <line x1="9" y1="14" x2="15" y2="14" />
      <line x1="9" y1="18" x2="12" y2="18" />
    </>
  ),
  person: (
    <>
      <circle cx="12" cy="7" r="4" />
      <path d="M4 21v-1a8 8 0 0116 0v1" />
    </>
  ),

  /* ── Metrics ─────────────────────────────────────────────── */
  flame: (
    <>
      <path d="M12 2c0 0-6 6.5-6 11.5a6 6 0 0012 0C18 8.5 12 2 12 2z" />
      <path d="M12 14c0 0-2 2-2 3.5a2 2 0 004 0C14 16 12 14 12 14z" />
    </>
  ),
  bolt: (
    <>
      <path d="M13 2L4.5 13H12l-1 9 8.5-11H12l1-9z" />
    </>
  ),
  footsteps: (
    <>
      <path d="M8 5a2 2 0 100-4 2 2 0 000 4z" fill="currentColor" stroke="none" />
      <path d="M6 7l-2 6M10 7l2 6" />
      <path d="M4 13l3 4M12 13l-3 4" />
      <path d="M16 11a2 2 0 100-4 2 2 0 000 4z" fill="currentColor" stroke="none" />
      <path d="M14 13l-2 6M18 13l2 6" />
      <path d="M12 19l3 2M20 19l-3 2" />
    </>
  ),
  moon: (
    <>
      <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
    </>
  ),
  droplet: (
    <>
      <path d="M12 2.69l5.66 5.66a8 8 0 11-11.31 0z" />
    </>
  ),
  dumbbell: (
    <>
      <rect x="2" y="10" width="4" height="4" rx="1" />
      <rect x="18" y="10" width="4" height="4" rx="1" />
      <rect x="4" y="8" width="3" height="8" rx="1" />
      <rect x="17" y="8" width="3" height="8" rx="1" />
      <line x1="7" y1="12" x2="17" y2="12" />
    </>
  ),
  target: (
    <>
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
    </>
  ),
  scale: (
    <>
      <line x1="12" y1="3" x2="12" y2="21" />
      <path d="M5 19h14" />
      <path d="M5 7l-3 6a3 3 0 006 0L5 7z" />
      <path d="M19 7l-3 6a3 3 0 006 0L19 7z" />
      <line x1="2" y1="7" x2="22" y2="7" />
    </>
  ),
  'chart-bar': (
    <>
      <line x1="18" y1="20" x2="18" y2="8" />
      <line x1="12" y1="20" x2="12" y2="3" />
      <line x1="6" y1="20" x2="6" y2="13" />
      <line x1="2" y1="20" x2="22" y2="20" />
    </>
  ),
  rotate: (
    <>
      <path d="M21 2v5h-5" />
      <path d="M3 22v-5h5" />
      <path d="M21 7A9 9 0 0012 3a9 9 0 00-6.75 3" />
      <path d="M3 17a9 9 0 009 4 9 9 0 006.75-3" />
    </>
  ),
  'chart-line': (
    <>
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </>
  ),

  /* ── Status ──────────────────────────────────────────────── */
  'check-circle': (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="M8 12l3 3 5-5" />
    </>
  ),
  check: (
    <>
      <path d="M4 12l5 5L20 6" />
    </>
  ),
  warning: (
    <>
      <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <circle cx="12" cy="17" r=".5" fill="currentColor" stroke="none" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </>
  ),
  trophy: (
    <>
      <path d="M6 9H4.5a2.5 2.5 0 000 5H6" />
      <path d="M18 9h1.5a2.5 2.5 0 010 5H18" />
      <path d="M7 3h10v6a5 5 0 01-10 0V3z" />
      <line x1="12" y1="14" x2="12" y2="18" />
      <line x1="8" y1="21" x2="16" y2="21" />
    </>
  ),
  star: (
    <>
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </>
  ),
  lock: (
    <>
      <rect x="5" y="11" width="14" height="11" rx="2" />
      <path d="M8 11V7a4 4 0 018 0v4" />
    </>
  ),

  /* ── Body / Health ───────────────────────────────────────── */
  'figure-lift': (
    <>
      <circle cx="12" cy="4" r="2" />
      <path d="M4 10h16M7 10l1 9h8l1-9" />
      <path d="M2 10h3M19 10h3" />
    </>
  ),
  body: (
    <>
      <circle cx="12" cy="4" r="2" />
      <path d="M12 6v8M8 9l4-1 4 1M9 22l3-8 3 8" />
    </>
  ),
  stethoscope: (
    <>
      <path d="M5 4h1a2 2 0 012 2v4a5 5 0 0010 0V6a2 2 0 012-2h1" />
      <circle cx="18" cy="16" r="3" />
    </>
  ),
  scan: (
    <>
      <path d="M3 7V5a2 2 0 012-2h2M3 17v2a2 2 0 002 2h2M17 3h2a2 2 0 012 2v2M17 21h2a2 2 0 002-2v-2" />
      <line x1="7" y1="12" x2="17" y2="12" />
    </>
  ),

  /* ── Food / Nutrition ────────────────────────────────────── */
  leaf: (
    <>
      <path d="M2 22l10-10M16 8c0 0-8 2-10 10 8-2 14-8 14-14C12 2 2 14 2 22" />
    </>
  ),
  bowl: (
    <>
      <path d="M4 10h16a8 8 0 01-16 0z" />
      <line x1="8" y1="22" x2="16" y2="22" />
      <line x1="12" y1="18" x2="12" y2="22" />
    </>
  ),

  /* ── Misc ────────────────────────────────────────────────── */
  'arrow-up': (
    <>
      <line x1="12" y1="19" x2="12" y2="5" />
      <polyline points="5 12 12 5 19 12" />
    </>
  ),
  'arrow-down': (
    <>
      <line x1="12" y1="5" x2="12" y2="19" />
      <polyline points="19 12 12 19 5 12" />
    </>
  ),
  'arrow-right': (
    <>
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </>
  ),
  notebook: (
    <>
      <rect x="4" y="2" width="16" height="20" rx="2" />
      <line x1="8" y1="6" x2="16" y2="6" />
      <line x1="8" y1="10" x2="16" y2="10" />
      <line x1="8" y1="14" x2="12" y2="14" />
    </>
  ),
  brain: (
    <>
      <path d="M9.5 2A2.5 2.5 0 007 4.5v.5a3.5 3.5 0 00-3 3.5v.5a3.5 3.5 0 003 3.5V22" />
      <path d="M14.5 2A2.5 2.5 0 0117 4.5v.5a3.5 3.5 0 013 3.5v.5a3.5 3.5 0 01-3 3.5V22" />
      <line x1="9" y1="12" x2="15" y2="12" />
    </>
  ),
};

export function Icon({ name, size = 20, color = 'currentColor', strokeWidth = 1.5, className = undefined, style = undefined }) {
  const paths = ICONS[name];
  if (!paths) return null;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
    >
      {paths}
    </svg>
  );
}
