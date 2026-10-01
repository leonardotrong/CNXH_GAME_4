import type { GameView, PublicQuestionView, TurnOutcome } from '@cnxh/shared';
import { PHASE_LABELS, describeCell, describeExplosion, describeShield, isBombPhase } from './boardText';
import { HostBomb } from './HostBomb';
import { HostLessons } from './HostLessons';
import { useCountdown } from './clock';
import { HexBoard } from './HexBoard';
import { OPTION_LABELS, QuestionPanel } from './QuestionPanel';
import { Standings } from './Standings';
import { TEAM_COLORS, teamName } from './teams';

/** Số ô được/mất của từng nhóm trong lượt vừa giải quyết. */
function deltasOf(outcome: TurnOutcome): Record<number, number> {
  const out: Record<number, number> = {};
  for (const [t, n] of Object.entries(outcome.gains)) out[Number(t)] = (out[Number(t)] ?? 0) + (n ?? 0);
  for (const [t, n] of Object.entries(outcome.losses)) out[Number(t)] = (out[Number(t)] ?? 0) - (n ?? 0);
  return out;
}

/** Màn chiếu trong trận Bàn Cờ (GAME_SPEC 5.1 BOARD). */
export function HostGame({
  game,
  question,
  activeTeamIds,
}: {
  game: GameView;
  question: PublicQuestionView | null;
  activeTeamIds: number[];
}) {
  const board = game.board!;
  const left = useCountdown(game.phaseEndsAt);
  const { phase } = game;

  if (isBombPhase(phase) && game.bomb) return <HostBomb game={game} question={question} activeTeamIds={activeTeamIds} />;

  const head = (
    <header className="host-game__head">
      <span>
        {phase === 'SUMMARY' ? 'Bàn Cờ Quyền Lực & Quả Bom Tham Nhũng' : `Lượt ${board.turn}/${board.totalTurns}`}
        {board.endAfterThisTurn && phase !== 'SUMMARY' && ' · lượt cuối'}
      </span>
      <span className="host-game__phase">{PHASE_LABELS[phase]}</span>
      {phase === 'BOARD_SELECT' && <span className={`host-game__timer ${left <= 5 ? 'is-urgent' : ''}`}>{left}</span>}
    </header>
  );

  const standings = (
    <Standings
      standings={board.standings}
      shields={board.shields}
      activeTeamIds={activeTeamIds}
      lockedTeamIds={phase === 'BOARD_SELECT' ? board.select?.locked : undefined}
    />
  );

  if (phase === 'BOARD_QUESTION' && question) {
    return (
      <section className="host-game host-game--question">
        {head}
        <div className="host-game__main">
          <QuestionPanel view={question} activeTeamIds={activeTeamIds} />
        </div>
        <aside className="host-game__side">
          <HexBoard owners={board.owners} shields={board.shields} targets={board.targets} label="Bàn cờ và mục tiêu các nhóm" />
        </aside>
      </section>
    );
  }

  if (phase === 'BOARD_REVEAL') {
    const reveal = question?.reveal;
    const outcome = board.outcome;
    return (
      <section className="host-game host-game--reveal">
        {head}
        <div className="host-game__main">
          <HexBoard owners={board.owners} shields={board.shields} targets={board.targets} outcome={outcome} />
        </div>
        <aside className="host-game__side">
          {reveal && question && (
            <div className="host-answer">
              <p className="host-answer__correct">
                Đáp án: <b>{OPTION_LABELS[reveal.answerIndex]}.</b> {question.options[reveal.answerIndex]}
              </p>
              <p className="host-answer__explanation">{reveal.explanation}</p>
            </div>
          )}
          <ul className="host-outcome">
            {outcome?.cells
              .filter((o) => o.result !== 'failed')
              .map((o) => (
                <li key={o.cellId} className={`host-outcome__item is-${o.result}`} style={{ borderColor: TEAM_COLORS[o.winner ?? o.attackers[0]!] }}>
                  {describeCell(o)}
                </li>
              ))}
            {outcome && outcome.cells.some((o) => o.result === 'failed') && (
              <li className="host-outcome__item is-failed" style={{ borderColor: '#999' }}>
                Tấn công thất bại (trả lời sai):{' '}
                {outcome.cells.filter((o) => o.result === 'failed').flatMap((o) => o.attackers).sort((a, b) => a - b).map(teamName).join(', ')}
              </li>
            )}
            {outcome?.cells.length === 0 && <li>Không nhóm nào tấn công lượt này.</li>}
            {outcome?.shieldsGranted.map((s) => (
              <li key={`${s.teamId}-${s.reason}`} className="host-outcome__item is-shield" style={{ borderColor: TEAM_COLORS[s.teamId] }}>
                🛡 {describeShield(s)}
              </li>
            ))}
          </ul>
          <Standings
            standings={board.standings}
            shields={board.shields}
            activeTeamIds={activeTeamIds}
            deltas={outcome ? deltasOf(outcome) : undefined}
          />
        </aside>
      </section>
    );
  }

  if (phase === 'SUMMARY' && game.summaryView === 'lessons') return <HostLessons />;

  if (phase === 'SUMMARY') {
    const podium = board.standings.filter((s) => activeTeamIds.includes(s.teamId) || s.cells > 0).slice(0, 3);
    return (
      <section className="host-game host-game--summary">
        {head}
        <div className="host-game__main">
          <ol className="podium">
            {podium.map((s) => (
              <li key={s.teamId} className={`podium__step podium__step--${s.rank}`} style={{ background: TEAM_COLORS[s.teamId] }}>
                <span className="podium__rank">Hạng {s.rank}</span>
                <span className="podium__team">{teamName(s.teamId)}</span>
                <span className="podium__score">{s.score} điểm</span>
              </li>
            ))}
          </ol>
          {standings}
        </div>
        <aside className="host-game__side">
          <HexBoard owners={board.owners} />
          {game.bomb && game.bomb.explosions.length > 0 && (
            <ul className="bomb-log">
              {game.bomb.explosions.map((e) => <li key={e.bombNumber}>Quả {e.bombNumber}: {describeExplosion(e)}</li>)}
            </ul>
          )}
        </aside>
      </section>
    );
  }

  // BOARD_SELECT (và QUESTION khi chưa nhận được câu hỏi)
  return (
    <section className="host-game host-game--select">
      {head}
      <div className="host-game__main">
        <HexBoard owners={board.owners} shields={board.shields} targets={board.targets} />
      </div>
      <aside className="host-game__side">
        {phase === 'BOARD_SELECT' && <p className="host-game__hint">Các nhóm đang chọn ô trên điện thoại…</p>}
        {standings}
      </aside>
    </section>
  );
}
