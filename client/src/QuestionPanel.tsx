import type { PublicQuestionView } from '@cnxh/shared';
import { CountdownRing } from './Countdown';
import { Icon } from './Icon';
import { Swatch } from './TeamTag';

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
        <span className="question__label">{view.status === 'open' ? (view.pool === 'board' ? 'Câu hỏi Bàn Cờ' : 'Câu hỏi Bom') : 'Đáp án'}</span>
        {view.status === 'open' && showTimer && <CountdownRing endsAt={view.endsAt} startedAt={view.startedAt} className="question__timer" />}
      </header>
      <h2 className="question__prompt">{view.prompt}</h2>
      <ol className="question__options">
        {view.options.map((opt, i) => (
          <li key={i} className={reveal ? (i === reveal.answerIndex ? 'is-correct' : 'is-wrong') : ''}>
            <b className="question__letter">{OPTION_LABELS[i]}</b>
            <span className="question__text">{opt}</span>
            {reveal && i === reveal.answerIndex && <Icon name="check" className="question__check" />}
          </li>
        ))}
      </ol>
      {reveal ? (
        <>
          <p className="question__explanation">{reveal.explanation}</p>
          <ol className="question__results">
            {reveal.results
              .filter((r) => !activeTeamIds || activeTeamIds.includes(r.teamId))
              .map((r, i, results) => (
                <li key={r.teamId} className={r.correct ? 'is-correct' : 'is-wrong'}>
                  <Swatch teamId={r.teamId} />
                  <span className="question__choice">{r.choice === null ? '—' : OPTION_LABELS[r.choice]}</span>
                  <Icon name={r.correct ? 'check' : 'x'} className="question__mark" />
                  <span className="question__ms">
                    {r.lockedBy === 'timeout' ? 'hết giờ' : formatMs(r.lockedAfterMs)}
                    {i > 0 && r.lockedBy === 'captain' && ` (+${r.lockedAfterMs - results[i - 1]!.lockedAfterMs} ms)`}
                  </span>
                </li>
              ))}
          </ol>
        </>
      ) : (
        (view.locked.length > 0 || waiting.length > 0) && (
          <div className="question__locked">
            <span className="question__locked-label">Đã chốt</span>
            {view.locked.map((l) => (
              <span key={l.teamId} className="lock-chip">
                <Swatch teamId={l.teamId} />
                {formatMs(l.lockedAfterMs)}
              </span>
            ))}
            {waiting.map((t) => (
              <span key={t} className="lock-chip is-waiting">
                <Swatch teamId={t} hollow />
              </span>
            ))}
          </div>
        )
      )}
    </section>
  );
}
