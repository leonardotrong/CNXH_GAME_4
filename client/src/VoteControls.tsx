import type { TeamVoteView } from '@cnxh/shared';
import { Icon } from './Icon';

/** Tiến độ bỏ phiếu của nhóm mình; vạch giữa = mốc "quá nửa" để đội trưởng được CHỐT. */
function VoteMeter({ view, lockedText }: { view: TeamVoteView; lockedText: string }) {
  if (view.locked) {
    return (
      <p className="vote-meter is-locked" role="status">
        <Icon name="lock" /> {lockedText}
      </p>
    );
  }
  const pct = view.onlineCount > 0 ? Math.min(100, (view.votedOnlineCount / view.onlineCount) * 100) : 0;
  return (
    <div className="vote-meter" role="status">
      <div className="vote-meter__bar" aria-hidden>
        <span style={{ width: `${pct}%` }} />
        <i />
      </div>
      <p>
        <b>
          {view.votedOnlineCount}/{view.onlineCount}
        </b>{' '}
        thành viên online đã bỏ phiếu
      </p>
    </div>
  );
}

/**
 * Phiếu của nhóm + (với đội trưởng khi vòng còn mở) nút CHỐT.
 * Nút CHỐT nằm trong thanh dính đáy màn hình cùng tiến độ phiếu để luôn thấy khi cuộn.
 */
export function VoteStatus({
  view,
  lockedText,
  showLock,
  onLock,
  lockLabel = 'CHỐT',
}: {
  view: TeamVoteView;
  lockedText: string;
  showLock: boolean;
  onLock: () => void;
  lockLabel?: string;
}) {
  const meter = <VoteMeter view={view} lockedText={lockedText} />;
  if (!showLock) return meter;
  return (
    <div className="lock-dock">
      {meter}
      <button className="lock-btn" disabled={!view.canLock} onClick={onLock}>
        <Icon name="lock" /> {lockLabel}
      </button>
      {!view.canLock && <p className="lock-hint">Chờ quá nửa thành viên online bỏ phiếu rồi mới CHỐT được</p>}
    </div>
  );
}
