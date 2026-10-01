import type { CSSProperties } from 'react';

const COLORS = ['#ffc83d', '#E53935', '#FB8C00', '#43A047', '#00ACC1', '#1E88E5', '#8E24AA', '#ffffff'];

/** Vị trí/nhịp "ngẫu nhiên" cố định theo chỉ số (không đổi giữa các lần vẽ lại). */
const PIECES = Array.from({ length: 64 }, (_, i) => ({
  left: (i * 37 + 11) % 100,
  delay: ((i * 53) % 45) / 10,
  duration: 4 + ((i * 29) % 30) / 10,
  color: COLORS[i % COLORS.length]!,
  rotate: (i * 47) % 360,
  scale: 0.6 + ((i * 17) % 9) / 10,
}));

/** Pháo giấy rơi trên màn vinh danh (chỉ trang trí, tắt khi người dùng chọn giảm chuyển động). */
export function Confetti() {
  return (
    <div className="confetti" aria-hidden>
      {PIECES.map((p, i) => (
        <i
          key={i}
          style={
            {
              left: `${p.left}%`,
              background: p.color,
              animationDelay: `${p.delay}s`,
              animationDuration: `${p.duration}s`,
              '--r': `${p.rotate}deg`,
              '--s': p.scale,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}
