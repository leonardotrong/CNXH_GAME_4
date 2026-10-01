import { useId } from 'react';

/**
 * Quả bom vẽ bằng SVG. Tia lửa ở đầu ngòi chỉ có hai trạng thái: đang cháy / tạm dừng.
 * Hoạt ảnh có nhịp CỐ ĐỊNH và dây ngòi không bao giờ ngắn lại — không lộ thời gian còn lại (server không gửi).
 */
export function BombIcon({ burning, className = '' }: { burning: boolean; className?: string }) {
  const id = `bomb${useId().replace(/[^\w-]/g, '')}`;
  return (
    <svg className={`bomb-icon ${burning ? 'is-burning' : ''} ${className}`} viewBox="0 0 100 100" aria-hidden>
      <defs>
        <radialGradient id={id} cx="0.36" cy="0.34" r="0.7">
          <stop offset="0" stopColor="#6b7390" />
          <stop offset="0.42" stopColor="#262b3f" />
          <stop offset="1" stopColor="#06080e" />
        </radialGradient>
      </defs>
      <path className="bomb-icon__fuse" d="M63 31 C 68 19, 78 20, 84 12" />
      <rect x="54" y="25" width="17" height="12" rx="3" fill="#3b425a" transform="rotate(38 62.5 31)" />
      <circle cx="45" cy="60" r="31" fill={`url(#${id})`} />
      <ellipse cx="34" cy="47" rx="9" ry="5.5" fill="#fff" opacity="0.22" transform="rotate(-35 34 47)" />
      <g transform="translate(84 12)">
        <g className="bomb-icon__spark">
          <path d="M0 -10 L2.4 -2.4 L10 0 L2.4 2.4 L0 10 L-2.4 2.4 L-10 0 L-2.4 -2.4 Z" fill="#ff9100" />
          <circle r="4.2" fill="#ffe082" />
        </g>
      </g>
    </svg>
  );
}
