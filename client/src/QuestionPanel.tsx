import type { PublicQuestionView } from '@cnxh/shared';
import { useCountdown } from './clock';
import { TEAM_COLORS, teamName } from './teams';

export const OPTION_LABELS = ['A', 'B', 'C', 'D'];

export function formatMs(ms: number): string {
  return `${(ms / 1000).toLocaleString('vi-VN', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} s`;
}

/** Câu hỏi + đếm ngược + thứ tự chốt / đáp án. Dùng cho /host (và /admin ở cỡ nhỏ). */
export function QuestionPanel({ view, activeTeamIds }: { view: PublicQuestionView; activeTeamIds?: number[] }) {
  const left = useCountdown(view.status === 'open' ? view.endsAt : null);
  const reveal = view.reveal;
  return (
    <section className={`question question--${view.status}`}>
      <header className="question__head">
        <span>{view.pool === 'board' ? 'Câu hỏi Bàn Cờ' : 'Câu hỏi Bom'}</span>
        {view.status === 'open' ? (
          <span className={`question__timer ${left <= 5 ? 'is-urgent' : ''}`}>{left}</span>
        ) : (
          <span>Đáp án</span>
        )}
      </header>
      <h2 className="question__prompt">{view.prompt}</h2>
      <ol className="question__options">
        {view.options.map((opt, i) => (
          <li key={i} className={reveal ? (i === reveal.answerIndex ? 'is-correct' : 'is-wrong') : ''}>
            <b>{OPTION_LABELS[i]}</b> {opt}
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
              <li key={r.teamId} style={{ borderColor: TEAM_COLORS[r.teamId] }}>
                <b style={{ color: TEAM_COLORS[r.teamId] }}>{teamName(r.teamId)}</b>
                <span>{r.choice === null ? '—' : OPTION_LABELS[r.choice]}</span>
                <span>{r.correct ? '✓' : '✗'}</span>
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
          {view.locked.map((l) => (
            <span key={l.teamId} className="chip" style={{ background: TEAM_COLORS[l.teamId] }}>
              {teamName(l.teamId)} đã chốt · {formatMs(l.lockedAfterMs)}
            </span>
          ))}
        </div>
      )}
    </section>
  );
}
