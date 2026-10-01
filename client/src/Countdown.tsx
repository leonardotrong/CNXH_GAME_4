import { useCountdown } from './clock';

const C = 2 * Math.PI * 44;

/**
 * Đồng hồ đếm ngược dạng vòng (pha chọn ô, câu hỏi, chọn nhóm nhận bom).
 * Vòng chỉ tính từ hạn của pha/câu hỏi — KHÔNG bao giờ dùng cho ngòi bom (client không biết ngòi).
 */
export function CountdownRing({
  endsAt,
  startedAt,
  urgentAt = 5,
  className = '',
}: {
  endsAt: number | null | undefined;
  startedAt?: number | null;
  urgentAt?: number;
  className?: string;
}) {
  const left = useCountdown(endsAt);
  const total = endsAt && startedAt ? Math.max(1, Math.round((endsAt - startedAt) / 1000)) : null;
  const frac = total ? Math.min(1, left / total) : 1;
  return (
    <div className={`ring ${left <= urgentAt ? 'is-urgent' : ''} ${className}`} role="timer" aria-label={`Còn ${left} giây`}>
      <svg viewBox="0 0 100 100" aria-hidden>
        <circle className="ring__track" cx="50" cy="50" r="44" />
        <circle className="ring__bar" cx="50" cy="50" r="44" strokeDasharray={C} strokeDashoffset={C * (1 - frac)} />
      </svg>
      <span className="ring__num">{left}</span>
    </div>
  );
}
