import { TEAM_IDS } from '@cnxh/shared';
import { teamName, teamStyle } from './teams';

/**
 * Thanh tỉ lệ lãnh thổ (kiểu State.io): mỗi nhóm một đoạn màu dài theo số ô đang giữ, phần xám là ô trống.
 * Thứ tự cố định theo số nhóm để mỗi nhóm luôn tìm thấy mình ở cùng chỗ.
 */
export function TerritoryBar({
  owners,
  minLabelShare = 0.07,
  className = '',
}: {
  owners: readonly (number | null)[];
  /** Chỉ ghi số ô khi đoạn đủ rộng (tỉ lệ tối thiểu; màn chiếu đủ chỗ cho mọi đoạn). */
  minLabelShare?: number;
  className?: string;
}) {
  const counts = TEAM_IDS.map((t) => ({ t, n: owners.filter((o) => o === t).length })).filter((x) => x.n > 0);
  const empty = owners.filter((o) => o === null).length;
  const total = Math.max(1, owners.length);
  const label = counts.map(({ t, n }) => `${teamName(t)}: ${n} ô`).join(', ');
  return (
    <div className={`territory-bar ${className}`} role="img" aria-label={`Lãnh thổ — ${label}`}>
      {counts.map(({ t, n }) => (
        <span key={t} className="territory-bar__seg" style={teamStyle(t, { flexGrow: n })}>
          {n / total >= minLabelShare && <b>{n}</b>}
        </span>
      ))}
      {empty > 0 && <span className="territory-bar__seg is-empty" style={{ flexGrow: empty }} />}
    </div>
  );
}
