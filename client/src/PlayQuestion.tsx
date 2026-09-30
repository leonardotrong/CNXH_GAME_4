import { useEffect, useState } from 'react';
import type { PublicQuestionView, TeamQuestionView } from '@cnxh/shared';
import { useCountdown } from './clock';
import { OPTION_LABELS } from './QuestionPanel';
import { socket } from './socket';

const ERRORS: Record<string, string> = {
  NOT_ENOUGH_VOTES: 'Cần quá nửa thành viên online bỏ phiếu mới chốt được.',
  NOT_CAPTAIN: 'Chỉ đội trưởng được chốt.',
  LOCKED: 'Nhóm đã chốt.',
  CLOSED: 'Câu hỏi đã đóng.',
};

/** Biểu quyết trên điện thoại (GAME_SPEC 2.2, 5.2). */
export function PlayQuestion({
  view,
  team,
  playerId,
}: {
  view: PublicQuestionView;
  team: TeamQuestionView | null;
  playerId: string;
}) {
  const left = useCountdown(view.status === 'open' ? view.endsAt : null);
  const [error, setError] = useState('');
  const current = team?.roundId === view.roundId ? team : null;
  const myVote = current?.votes[playerId];
  const isCaptain = current?.captainId === playerId;
  const open = view.status === 'open' && !current?.locked;

  // Rung nhẹ khi câu mới bắt đầu.
  useEffect(() => {
    if (view.status === 'open') navigator.vibrate?.(200);
    setError('');
  }, [view.roundId]);

  const vote = (option: number) =>
    socket.emit('player:vote', { roundId: view.roundId, option }, (res) => setError(res.ok ? '' : ERRORS[res.error] ?? ''));
  const lock = () =>
    socket.emit('player:lock', { roundId: view.roundId }, (res) => setError(res.ok ? '' : ERRORS[res.error] ?? ''));

  const reveal = view.reveal;
  const myResult = reveal?.results.find((r) => r.teamId === current?.teamId);

  return (
    <section className="play-question">
      <div className="play-question__timer">{view.status === 'open' ? `${left} s` : 'Đáp án'}</div>
      <h2 className="play-question__prompt">{view.prompt}</h2>
      <div className="play-question__options">
        {view.options.map((opt, i) => {
          const classes = ['option-btn'];
          if (myVote === i) classes.push('is-mine');
          if (current?.choice === i) classes.push('is-chosen');
          if (reveal) classes.push(i === reveal.answerIndex ? 'is-correct' : 'is-wrong');
          return (
            <button key={i} className={classes.join(' ')} disabled={!open} onClick={() => vote(i)}>
              <b>{OPTION_LABELS[i]}</b>
              <span>{opt}</span>
              <span className="option-btn__count">{current?.tally[i] ?? 0}</span>
            </button>
          );
        })}
      </div>

      {current && (
        <p className="play-question__status">
          {current.locked
            ? `Nhóm đã chốt: ${current.choice === null ? 'không có lựa chọn' : OPTION_LABELS[current.choice]}`
            : `${current.votedOnlineCount}/${current.onlineCount} thành viên online đã bỏ phiếu`}
        </p>
      )}

      {isCaptain && open && (
        <button className="lock-btn" disabled={!current?.canLock} onClick={lock}>
          CHỐT
        </button>
      )}
      {error && <p className="form-error" role="alert">{error}</p>}

      {reveal && (
        <div className={`play-question__result ${myResult?.correct ? 'is-correct' : 'is-wrong'}`}>
          <strong>{myResult?.correct ? 'Nhóm trả lời ĐÚNG!' : 'Nhóm trả lời chưa đúng'}</strong>
          <p>{reveal.explanation}</p>
        </div>
      )}
    </section>
  );
}
