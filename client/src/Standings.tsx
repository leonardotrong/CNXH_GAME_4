import type { ShieldGrant, Standing } from '@cnxh/shared';
import { shieldName } from './boardText';
import { TEAM_COLORS, teamName } from './teams';

/** Bảng 7 nhóm: hạng, màu, điểm, số ô, khiên, số câu đúng (GAME_SPEC 3.6, 5.1). */
export function Standings({
  standings,
  shields = [],
  activeTeamIds,
  highlight,
  lockedTeamIds,
  deltas,
}: {
  standings: readonly Standing[];
  shields?: readonly ShieldGrant[];
  /** Chỉ hiện các nhóm này (nhóm có người hoặc có ô). */
  activeTeamIds?: readonly number[];
  highlight?: number;
  /** Nhóm đã chốt trong pha hiện tại. */
  lockedTeamIds?: readonly number[];
  /** Số ô được (+) / mất (−) trong lượt vừa xong. */
  deltas?: Readonly<Record<number, number>>;
}) {
  const rows = activeTeamIds ? standings.filter((s) => activeTeamIds.includes(s.teamId) || s.cells > 0) : standings;
  return (
    <ol className="standings">
      {rows.map((s) => {
        const teamShields = shields.filter((x) => x.teamId === s.teamId);
        return (
          <li
            key={s.teamId}
            className={[s.teamId === highlight ? 'is-me' : '', deltas?.[s.teamId] ? (deltas[s.teamId]! > 0 ? 'is-gain' : 'is-loss') : ''].join(' ')}
            style={{ borderColor: TEAM_COLORS[s.teamId] }}
          >
            <span className="standings__rank">{s.rank}</span>
            <span className="standings__swatch" style={{ background: TEAM_COLORS[s.teamId] }}>{s.teamId}</span>
            <span className="standings__name">
              {teamName(s.teamId)}
              {teamShields.length > 0 && (
                <span className="standings__shield" title={teamShields.map((x) => shieldName(x.reason)).join(', ')}>
                  {' '}🛡
                </span>
              )}
              {lockedTeamIds?.includes(s.teamId) && <span className="standings__locked"> ✓</span>}
            </span>
            <span className="standings__score">
              {s.score}
              {!!deltas?.[s.teamId] && (
                <span className={`standings__delta ${deltas[s.teamId]! > 0 ? 'is-up' : 'is-down'}`}>
                  {deltas[s.teamId]! > 0 ? `+${deltas[s.teamId]}` : `−${-deltas[s.teamId]!}`} ô
                </span>
              )}
            </span>
            <span className="standings__meta">{s.correct} câu đúng</span>
          </li>
        );
      })}
    </ol>
  );
}
