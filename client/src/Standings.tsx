import type { ShieldGrant, Standing } from '@cnxh/shared';
import { shieldName } from './boardText';
import { Icon } from './Icon';
import { Swatch } from './TeamTag';
import { teamName } from './teams';

/** Bảng 7 nhóm: hạng, màu, điểm, khiên (GAME_SPEC 3.6, 5.1). */
export function Standings({
  standings,
  shields = [],
  activeTeamIds,
  highlight,
  lockedTeamIds,
  deltas,
  showMeta = false,
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
  /** Hiện số ô và số câu đúng (tiêu chí phụ khi bằng điểm). */
  showMeta?: boolean;
}) {
  const rows = activeTeamIds ? standings.filter((s) => activeTeamIds.includes(s.teamId) || s.cells > 0) : standings;
  return (
    <ol className="standings">
      {rows.map((s) => {
        const teamShields = shields.filter((x) => x.teamId === s.teamId);
        const delta = deltas?.[s.teamId] ?? 0;
        const classes = ['standings__row'];
        if (s.teamId === highlight) classes.push('is-me');
        if (delta > 0) classes.push('is-gain');
        if (delta < 0) classes.push('is-loss');
        return (
          <li key={s.teamId} className={classes.join(' ')}>
            <span className="standings__rank">{s.rank}</span>
            <Swatch teamId={s.teamId} />
            <span className="standings__name">
              {teamName(s.teamId)}
              {teamShields.length > 0 && (
                <span className="standings__shield" title={teamShields.map((x) => shieldName(x.reason)).join(', ')}>
                  <Icon name="shield" />
                </span>
              )}
              {lockedTeamIds?.includes(s.teamId) && (
                <span className="standings__locked" title="Đã chốt">
                  <Icon name="check" />
                </span>
              )}
            </span>
            {showMeta && (
              <span className="standings__meta">
                {s.cells} ô · {s.correct} câu đúng
              </span>
            )}
            {delta !== 0 && <span className={`standings__delta ${delta > 0 ? 'is-up' : 'is-down'}`}>{delta > 0 ? `+${delta}` : `−${-delta}`}</span>}
            <span className="standings__score">{s.score}</span>
          </li>
        );
      })}
    </ol>
  );
}
