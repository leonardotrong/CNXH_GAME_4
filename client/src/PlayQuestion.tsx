import { useEffect, useState, type CSSProperties } from 'react';
import type { PublicQuestionView, TeamQuestionView } from '@cnxh/shared';
import { CountdownRing } from './Countdown';
import { Icon } from './Icon';
import { OPTION_LABELS, questionLabel } from './QuestionPanel';
import { ACK_TIMEOUT_MS, orNetworkError, socket } from './socket';
import { VoteStatus } from './VoteControls';

export const VOTE_ERRORS: Record<string, string> = {
  NOT_ENOUGH_VOTES: 'Cần quá nửa thành viên online bỏ phiếu mới chốt được.',
  NOT_CAPTAIN: 'Chỉ đội trưởng được chốt.',
  LOCKED: 'Nhóm đã chốt.',
  PAUSED: 'Trận đang tạm dừng.',
  CLOSED: 'Câu hỏi đã đóng.',
  NETWORK: 'Mạng chập chờn — chưa gửi được, chạm lại.',
  PLAYER_NOT_FOUND: 'Đang vào lại phòng — chạm lại sau giây lát.',
};

/** Biểu quyết trên điện thoại (GAME_SPEC 2.2, 5.2). */
export function PlayQuestion({
  view,
  team,
  playerId,
  readOnly = false,
  practice = false,
}: {
  view: PublicQuestionView;
  team: TeamQuestionView | null;
  playerId: string;
  /** Nhóm không trả lời câu này (Quả Bom: chỉ nhóm cầm bom trả lời) — chỉ xem. */
  readOnly?: boolean;
  /** Câu thử ngoài trận: không tính điểm. */
  practice?: boolean;
}) {
  const [error, setError] = useState('');
  // Phiếu vừa chạm, hiện ngay trước khi server xác nhận (mạng 4G có thể trễ vài trăm ms).
  const [pending, setPending] = useState<number | null>(null);
  const current = team?.roundId === view.roundId ? team : null;
  const myVote = pending ?? current?.votes[playerId];
  const isCaptain = current?.captainId === playerId;
  const open = !readOnly && view.status === 'open' && !current?.locked;

  // Rung nhẹ khi câu mới bắt đầu.
  useEffect(() => {
    if (view.status === 'open' && !readOnly) navigator.vibrate?.(200);
    setError('');
    setPending(null);
  }, [view.roundId]);
  // Server đã ghi nhận (hoặc nhóm đã chốt) → bỏ trạng thái chờ.
  useEffect(() => {
    if (pending !== null && (current?.votes[playerId] === pending || current?.locked)) setPending(null);
  }, [current, pending, playerId]);

  const vote = (option: number) => {
    navigator.vibrate?.(12);
    setPending(option);
    socket.timeout(ACK_TIMEOUT_MS).emit(
      'player:vote',
      { roundId: view.roundId, option },
      orNetworkError((res) => {
        if (!res.ok) setPending(null);
        setError(res.ok ? '' : VOTE_ERRORS[res.error] ?? '');
      }),
    );
  };
  const lock = () =>
    socket
      .timeout(ACK_TIMEOUT_MS)
      .emit('player:lock', { roundId: view.roundId }, orNetworkError((res) => setError(res.ok ? '' : VOTE_ERRORS[res.error] ?? '')));

  const reveal = view.reveal;
  const myResult = reveal?.results.find((r) => r.teamId === current?.teamId);

  return (
    <section className={`play-question ${readOnly ? 'is-readonly' : ''}`}>
      <div className="play-task">
        {view.status === 'open' && <CountdownRing endsAt={view.endsAt} startedAt={view.startedAt} />}
        <span className="play-task__text">
          <b>{questionLabel(view, practice)}</b>
          <span>
            {readOnly && view.status === 'open'
              ? 'Chỉ xem — nhóm khác đang trả lời.'
              : open
                ? 'Chạm để bỏ phiếu cho nhóm.'
                : view.status === 'open'
                  ? 'Nhóm đã chốt, chờ các nhóm khác…'
                  : 'Xem giải thích bên dưới.'}
          </span>
        </span>
      </div>
      <h2 className="play-question__prompt">{view.prompt}</h2>
      <div className="play-question__options">
        {view.options.map((opt, i) => {
          const classes = ['option-btn'];
          if (myVote === i) classes.push('is-mine');
          if (current?.choice === i) classes.push('is-chosen');
          if (reveal) classes.push(i === reveal.answerIndex ? 'is-correct' : 'is-wrong');
          const votes = current?.tally[i] ?? 0;
          const share = current && current.onlineCount > 0 ? Math.min(100, (votes / current.onlineCount) * 100) : 0;
          return (
            <button
              key={i}
              className={classes.join(' ')}
              disabled={!open}
              onClick={() => vote(i)}
              style={{ '--votes': `${share}%` } as CSSProperties}
            >
              <b className="option-btn__letter">{OPTION_LABELS[i]}</b>
              <span className="option-btn__text">
                {opt}
                {current?.choice === i && <small className="option-btn__chosen">Nhóm đã chốt</small>}
              </span>
              {current && <span className="option-btn__count">{votes}</span>}
            </button>
          );
        })}
      </div>

      {current && !reveal && (
        <VoteStatus
          view={current}
          lockedText={`Nhóm đã chốt: ${current.choice === null ? 'không có lựa chọn' : OPTION_LABELS[current.choice]}`}
          showLock={isCaptain && open}
          onLock={lock}
        />
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      {reveal && readOnly && (
        <div className="result-card">
          <p>{reveal.explanation}</p>
        </div>
      )}
      {reveal && !readOnly && (
        <div className={`result-card ${myResult?.correct ? 'is-correct' : 'is-wrong'}`}>
          <strong>
            <Icon name={myResult?.correct ? 'check' : 'x'} />
            {myResult?.correct ? 'Nhóm trả lời đúng' : 'Nhóm trả lời chưa đúng'}
            {current?.locked && current.choice !== null && <span className="result-card__sub"> · đã chọn {OPTION_LABELS[current.choice]}</span>}
          </strong>
          <p>{reveal.explanation}</p>
        </div>
      )}
    </section>
  );
}
