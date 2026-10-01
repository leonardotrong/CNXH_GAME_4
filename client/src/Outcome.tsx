import { useLayoutEffect, useRef, useState } from 'react';
import { CONSTITUTION_CELL, formatSeconds, type CellOutcome, type ShieldGrant, type TurnOutcome } from '@cnxh/shared';
import { shieldName } from './boardText';
import { Icon, type IconName } from './Icon';
import { TeamTag } from './TeamTag';

/** Biểu tượng theo kết quả của một ô bị nhắm. */
const OUTCOME_ICONS: Record<CellOutcome['result'], IconName> = {
  captured: 'flag',
  defended: 'shield',
  tie: 'equal',
  shielded: 'shield',
  failed: 'x',
};

function CellName({ o }: { o: CellOutcome }) {
  if (o.cellId === CONSTITUTION_CELL) return <b>ô Hiến pháp</b>;
  return o.previousOwner === null ? (
    <>ô trống</>
  ) : (
    <>
      ô của <TeamTag teamId={o.previousOwner} />
    </>
  );
}

const tags = (ids: readonly number[]) => (
  <span className="tag-group">
    {ids.map((t) => (
      <TeamTag key={t} teamId={t} />
    ))}
  </span>
);

/**
 * Câu kết quả một ô cho màn chiếu, tên nhóm hiện bằng nhãn màu.
 * Cùng nội dung với `describeCell` (shared/src/describe.ts) — sửa câu chữ thì sửa cả hai.
 */
export function OutcomeText({ o }: { o: CellOutcome }) {
  switch (o.result) {
    case 'captured': {
      const second = o.contenders[1];
      const other = second?.correct ? second.teamId : null;
      return (
        <>
          <TeamTag teamId={o.winner!} /> chiếm <CellName o={o} />
          {other !== null && o.marginMs !== null && (
            <span className="outcome__margin">
              {' '}
              — nhanh hơn <TeamTag teamId={other} /> <b>{formatSeconds(o.marginMs)}</b>
            </span>
          )}
        </>
      );
    }
    case 'defended':
      return (
        <>
          <TeamTag teamId={o.winner!} /> phòng thủ thành công trước {tags(o.attackers)}
          {o.marginMs !== null && (
            <span className="outcome__margin">
              {' '}
              — nhanh hơn <b>{formatSeconds(o.marginMs)}</b>
            </span>
          )}
        </>
      );
    case 'tie':
      return (
        <>
          {tags(o.contenders.filter((c) => c.correct).slice(0, 2).map((c) => c.teamId))} chốt cùng mili-giây — <CellName o={o} /> giữ nguyên
        </>
      );
    case 'shielded':
      return (
        <>
          Khiên chặn {tags(o.attackers)} tấn công <CellName o={o} />
        </>
      );
    case 'failed':
      return (
        <>
          {tags(o.attackers)} tấn công <CellName o={o} /> thất bại
        </>
      );
  }
}

/** Danh sách kết quả từng ô của lượt (REVEAL trên màn chiếu); quá dài thì mờ dần ở đáy. */
export function OutcomeList({ outcome }: { outcome: TurnOutcome | null }) {
  const ref = useRef<HTMLUListElement>(null);
  const [clipped, setClipped] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Đo theo vị trí bố cục (offsetTop) — không dùng scrollHeight vì hiệu ứng trượt vào (transform) làm nó tạm lớn hơn.
    const check = () => {
      const last = el.lastElementChild as HTMLElement | null;
      setClipped(!!last && last.offsetTop + last.offsetHeight > el.clientHeight + 1);
    };
    check();
    const observer = new ResizeObserver(check);
    observer.observe(el);
    return () => observer.disconnect();
  }, [outcome]);
  if (!outcome) return null;

  const failed = outcome.cells.filter((o) => o.result === 'failed');
  // Chiếm ô trống không ai tranh: gộp một dòng cho gọn (nội dung như describeCell, không có chênh lệch ms).
  const isPlainGrab = (o: CellOutcome) =>
    o.result === 'captured' && o.previousOwner === null && o.cellId !== CONSTITUTION_CELL && !o.contenders[1]?.correct;
  const grabs = outcome.cells.filter(isPlainGrab);
  const shieldGroups = (['constitution', 'protection'] as ShieldGrant['reason'][])
    .map((reason) => ({ reason, teams: outcome.shieldsGranted.filter((s) => s.reason === reason).map((s) => s.teamId) }))
    .filter((g) => g.teams.length > 0);
  return (
    <ul ref={ref} className={`outcomes ${clipped ? 'is-clipped' : ''}`}>
      {outcome.cells
        .filter((o) => o.result !== 'failed' && (grabs.length < 2 || !isPlainGrab(o)))
        .map((o) => (
          <li key={o.cellId} className={`outcome is-${o.result}`}>
            <Icon name={OUTCOME_ICONS[o.result]} className="outcome__icon" />
            <span>
              <OutcomeText o={o} />
            </span>
          </li>
        ))}
      {grabs.length >= 2 && (
        <li className="outcome is-captured">
          <Icon name="flag" className="outcome__icon" />
          <span>
            {tags(grabs.map((o) => o.winner!).sort((a, b) => a - b))} chiếm ô trống
          </span>
        </li>
      )}
      {failed.length > 0 && (
        <li className="outcome is-failed">
          <Icon name="x" className="outcome__icon" />
          <span>
            Tấn công thất bại (trả lời sai): {tags(failed.flatMap((o) => o.attackers).sort((a, b) => a - b))}
          </span>
        </li>
      )}
      {outcome.cells.length === 0 && <li className="outcome is-none">Không nhóm nào tấn công lượt này.</li>}
      {shieldGroups.length > 0 && (
        <li className="outcome is-shield">
          <Icon name="shield" className="outcome__icon" />
          <span>
            {shieldGroups.map((g, i) => (
              <span key={g.reason}>
                {i > 0 && ' · '}
                <b>{shieldName(g.reason)}</b> {tags(g.teams)}
              </span>
            ))}{' '}
            cho lượt sau
          </span>
        </li>
      )}
    </ul>
  );
}
