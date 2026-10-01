import type { ReactNode } from 'react';

/** Bộ icon nét mảnh (24×24, vẽ bằng `currentColor`) thay cho emoji — cùng một phong cách trên mọi màn hình. */
const PATHS = {
  vote: (
    <>
      <path d="M4 13h16v7H4z" />
      <path d="M8 13V4h8v9" />
      <path d="m10 8.5 1.6 1.6L15 6.8" />
    </>
  ),
  target: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1" />
    </>
  ),
  question: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.6 9.3a2.5 2.5 0 0 1 4.9.8c0 1.6-2.5 2.2-2.5 3.8" />
      <path d="M12 17h.01" />
    </>
  ),
  bolt: <path d="M13 2 4 14h7l-1 8 9-12h-7z" />,
  book: (
    <>
      <path d="M3 5h5a4 4 0 0 1 4 4v11a3 3 0 0 0-3-3H3z" />
      <path d="M21 5h-5a4 4 0 0 0-4 4v11a3 3 0 0 1 3-3h6z" />
    </>
  ),
  shield: <path d="M12 21s7.5-3.6 7.5-9.5V5.6L12 3 4.5 5.6v5.9C4.5 17.4 12 21 12 21z" />,
  bomb: (
    <>
      <circle cx="10.5" cy="14" r="6.5" />
      <path d="m15 9.5 2-2" />
      <path d="M17.5 7a2.6 2.6 0 0 1 3.5-.4" />
    </>
  ),
  check: <path d="M20 6 9 17l-5-5" />,
  x: (
    <>
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </>
  ),
  lock: (
    <>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </>
  ),
  flag: (
    <>
      <path d="M5 21V4" />
      <path d="M5 4h12l-2.5 4L17 12H5" />
    </>
  ),
  equal: (
    <>
      <path d="M5 9h14" />
      <path d="M5 15h14" />
    </>
  ),
  repeat: (
    <>
      <path d="m17 2 4 4-4 4" />
      <path d="M3 11V9a3 3 0 0 1 3-3h15" />
      <path d="m7 22-4-4 4-4" />
      <path d="M21 13v2a3 3 0 0 1-3 3H3" />
    </>
  ),
  timer: (
    <>
      <circle cx="12" cy="13" r="8" />
      <path d="M12 9v4l2.5 2.5" />
      <path d="M9 2h6" />
    </>
  ),
  burst: <path d="m12 2 2.1 5.4L19.5 5l-2.4 5.4L22 12l-4.9 1.6 2.4 5.4-5.4-2.4L12 22l-2.1-5.4L4.5 19l2.4-5.4L2 12l4.9-1.6L4.5 5l5.4 2.4z" />,
  arrow: (
    <>
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
    </>
  ),
  pause: (
    <>
      <path d="M9 5v14" />
      <path d="M15 5v14" />
    </>
  ),
  play: <path d="M7 4v16l13-8z" />,
  volume: (
    <>
      <path d="M11 5 6 9H3v6h3l5 4z" />
      <path d="M15.5 8.5a5 5 0 0 1 0 7" />
      <path d="M18.5 5.5a9 9 0 0 1 0 13" />
    </>
  ),
  mute: (
    <>
      <path d="M11 5 6 9H3v6h3l5 4z" />
      <path d="m22 9-6 6" />
      <path d="m16 9 6 6" />
    </>
  ),
  monitor: (
    <>
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <path d="M8 20h8" />
      <path d="M12 16v4" />
    </>
  ),
  phone: (
    <>
      <rect x="7" y="2" width="10" height="20" rx="2" />
      <path d="M11 18h2" />
    </>
  ),
  sliders: (
    <>
      <path d="M4 6h10" />
      <path d="M18 6h2" />
      <circle cx="16" cy="6" r="2" />
      <path d="M4 12h4" />
      <path d="M12 12h8" />
      <circle cx="10" cy="12" r="2" />
      <path d="M4 18h12" />
      <circle cx="18" cy="18" r="2" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
      <path d="M16 4.6a3.5 3.5 0 0 1 0 6.8" />
      <path d="M18.5 14.2A6.5 6.5 0 0 1 21.5 20" />
    </>
  ),
} satisfies Record<string, ReactNode>;

export type IconName = keyof typeof PATHS;

export function Icon({ name, className = '' }: { name: IconName; className?: string }) {
  return (
    <svg
      className={`icon ${className}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {PATHS[name]}
    </svg>
  );
}
