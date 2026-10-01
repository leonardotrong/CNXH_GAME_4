import type { PublicQuestionView } from '@cnxh/shared';
import { CountdownRing } from './Countdown';
import { TeamTag } from './TeamTag';
import { teamStyle } from './teams';

export const OPTION_LABELS = ['A', 'B', 'C', 'D'];

export function formatMs(ms: number): string {
  return `${(ms / 1000).toLocaleString('vi-VN', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} s`;
}

/**
 * Câu hỏi + đếm ngược + thứ tự chốt / đáp án. Dùng cho /host (và /admin ở cỡ nhỏ).
 * `showTimer = false` khi đồng hồ đã nằm ở thanh trên của màn chiếu.
 */
export function QuestionPanel({
  view,
  activeTeamIds,
  showTimer = true,
}: {
  view: PublicQuestionView;
  activeTeamIds?: number[];
  showTimer?: boolean;
}) {
  const reveal = view.reveal;
  const waiting = view.teamIds.filter((t) => (!activeTeamIds || activeTeamIds.includes(t)) && !view.locked.some((l) => l.teamId === t));
  return (
    <section className={`question question--${view.status}`}>
      <header className="question__head">
        <span className={`question__tag question__tag--${view.pool}`}>{view.pool === 'board' ? 'Câu hỏi Bàn Cờ' : '💣 Câu hỏi Bom'}</span>
        {view.status === 'open' ? (
          showTimer && <CountdownRing endsAt={view.endsAt} startedAt={view.startedAt} className="question__timer" />
        ) : (
          <span className="question__done">Đáp án</span>
        )}
      </header>
      <h2 className="question__prompt">{view.prompt}</h2>
      <ol className={`question__options ${view.options.length === 2 ? 'is-two' : ''}`}>
        {view.options.map((opt, i) => (
          <li key={i} className={reveal ? (i === reveal.answerIndex ? 'is-correct' : 'is-wrong') : ''}>
            <b className="question__letter">{OPTION_LABELS[i]}</b>
            <span>{opt}</span>
            {reveal && i === reveal.answerIndex && <span className="question__check" aria-label="Đáp án đúng">✓</span>}
          </li>
        ))}
      </ol>
      {reveal ? (
        <>
          <p className="question__explanation">
            <b>Giải thích.</b> {reveal.explanation}
          </p>
          <ol className="question__results">
            {reveal.results
              .filter((r) => !activeTeamIds || activeTeamIds.includes(r.teamId))
              .map((r, i, results) => (
                <li key={r.teamId} className={r.correct ? 'is-correct' : 'is-wrong'} style={teamStyle(r.teamId)}>
                  <TeamTag teamId={r.teamId} />
                  <span className="question__choice">{r.choice === null ? '—' : OPTION_LABELS[r.choice]}</span>
                  <span className="question__mark">{r.correct ? '✓' : '✗'}</span>
                  <span className="question__ms">
                    {r.lockedBy === 'timeout' ? 'hết giờ' : formatMs(r.lockedAfterMs)}
                    {i > 0 && r.lockedBy === 'captain' && ` (+${r.lockedAfterMs - results[i - 1]!.lockedAfterMs} ms)`}
                  </span>
                </li>
              ))}
          </ol>
        </>
      ) : (
        <div className="question__locked">
          {view.locked.map((l, i) => (
            <span key={l.teamId} className="lock-chip is-locked" style={teamStyle(l.teamId)}>
              <b>{i + 1}</b> Nhóm {l.teamId} · {formatMs(l.lockedAfterMs)}
            </span>
          ))}
          {waiting.map((t) => (
            <span key={t} className="lock-chip" style={teamStyle(t)}>
              Nhóm {t} …
            </span>
          ))}
        </div>
      )}
    </section>
  );
}
