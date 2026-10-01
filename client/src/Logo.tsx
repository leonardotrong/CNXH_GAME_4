const STAR = Array.from({ length: 10 }, (_, i) => {
  const a = (Math.PI / 5) * i - Math.PI / 2;
  const r = i % 2 === 0 ? 25 : 10;
  return `${(50 + r * Math.cos(a)).toFixed(2)},${(53 + r * Math.sin(a)).toFixed(2)}`;
}).join(' ');

/** Biểu trưng của trò chơi: ô lục giác đỏ, sao vàng ở giữa (màu phẳng). */
export function Logo({ className = '' }: { className?: string }) {
  return (
    <svg className={`logo ${className}`} viewBox="0 0 100 100" aria-hidden>
      <polygon points="50,4 89.8,27 89.8,73 50,96 10.2,73 10.2,27" fill="#da2b2b" stroke="#da2b2b" strokeWidth="6" strokeLinejoin="round" />
      <polygon points={STAR} fill="#ffc83d" />
    </svg>
  );
}
