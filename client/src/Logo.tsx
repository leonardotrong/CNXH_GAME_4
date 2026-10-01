import { useId } from 'react';

const STAR = Array.from({ length: 10 }, (_, i) => {
  const a = (Math.PI / 5) * i - Math.PI / 2;
  const r = i % 2 === 0 ? 25 : 10;
  return `${(50 + r * Math.cos(a)).toFixed(2)},${(53 + r * Math.sin(a)).toFixed(2)}`;
}).join(' ');

/** Biểu trưng của trò chơi: ô lục giác đỏ viền vàng, sao vàng ở giữa. */
export function Logo({ className = '' }: { className?: string }) {
  const id = `logo${useId().replace(/[^\w-]/g, '')}`;
  return (
    <svg className={`logo ${className}`} viewBox="0 0 100 100" aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f2463d" />
          <stop offset="1" stopColor="#a90f19" />
        </linearGradient>
      </defs>
      <polygon points="50,4 89.8,27 89.8,73 50,96 10.2,73 10.2,27" fill={`url(#${id})`} stroke="#ffc83d" strokeWidth="5" strokeLinejoin="round" />
      <polygon points={STAR} fill="#ffc83d" />
    </svg>
  );
}
