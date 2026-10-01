import type { GameView, PublicQuestionView, TurnOutcome } from '@cnxh/shared';
import { PHASE_LABELS, describeExplosion, isBombPhase } from './boardText';
import { Confetti } from './Confetti';
import { CountdownRing } from './Countdown';
import { HostBomb } from './HostBomb';
import { AnswerCard, HostBar } from './HostParts';
import { HostLessons } from './HostLessons';
import { HexBoard } from './HexBoard';
import { OutcomeList } from './Outcome';
import { QuestionPanel } from './QuestionPanel';
import { Standings } from './Standings';
import { teamName, teamStyle } from './teams';

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
  const { phase } = game;

  if (isBombPhase(phase) && game.bomb) return <HostBomb game={game} question={question} activeTeamIds={activeTeamIds} />;
  if (phase === 'SUMMARY' && game.summaryView === 'lessons') return <HostLessons />;

  const turnBadge = (
    <>
      Lượt <b>{board.turn}</b>/{board.totalTurns}
    </>
  );
  const lastTurn = board.endAfterThisTurn && phase !== 'SUMMARY' && <span className="host-bar__flag">Lượt cuối</span>;

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
        <HostBar badge={turnBadge} title={PHASE_LABELS[phase]}>
          {lastTurn}
          {question.status === 'open' && <CountdownRing endsAt={question.endsAt} startedAt={question.startedAt} />}
        </HostBar>
        <div className="host-game__main">
          <QuestionPanel view={question} activeTeamIds={activeTeamIds} showTimer={false} />
        </div>
        <aside className="host-game__side">
          <p className="host-side__title">Mục tiêu các nhóm</p>
          <HexBoard owners={board.owners} shields={board.shields} targets={board.targets} label="Bàn cờ và mục tiêu các nhóm" />
        </aside>
      </section>
    );
  }

  if (phase === 'BOARD_REVEAL') {
    const outcome = board.outcome;
    return (
      <section className="host-game host-game--reveal">
        <HostBar badge={turnBadge} title={PHASE_LABELS[phase]}>
          {lastTurn}
        </HostBar>
        <div className="host-game__main">
          <HexBoard owners={board.owners} shields={board.shields} targets={board.targets} outcome={outcome} />
        </div>
        <aside className="host-game__side">
          {question?.reveal && <AnswerCard question={question} />}
          <OutcomeList outcome={outcome} />
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

  if (phase === 'SUMMARY') {
    const podium = board.standings.filter((s) => activeTeamIds.includes(s.teamId) || s.cells > 0).slice(0, 3);
    return (
      <section className="host-game host-game--summary">
        <Confetti />
        <HostBar badge="🏆 Vinh danh" title="Kết thúc trận" />
        <div className="host-game__main">
          <ol className="podium">
            {podium.map((s) => (
              <li key={s.teamId} className={`podium__step podium__step--${Math.min(s.rank, 3)}`} style={teamStyle(s.teamId)}>
                {s.rank === 1 && (
                  <span className="podium__crown" aria-hidden>
                    👑
                  </span>
                )}
                <span className="podium__team">{teamName(s.teamId)}</span>
                <span className="podium__score">{s.score} điểm</span>
                <span className="podium__block">
                  <span className="podium__medal">{s.rank}</span>
                </span>
              </li>
            ))}
          </ol>
          {standings}
        </div>
        <aside className="host-game__side">
          <p className="host-side__title">Bàn cờ chung cuộc</p>
          <HexBoard owners={board.owners} />
          {game.bomb && game.bomb.explosions.length > 0 && (
            <ul className="bomb-log">
              {game.bomb.explosions.map((e) => (
                <li key={e.bombNumber}>
                  💥 Quả {e.bombNumber}: {describeExplosion(e)}
                </li>
              ))}
            </ul>
          )}
        </aside>
      </section>
    );
  }

  // BOARD_SELECT (và QUESTION khi chưa nhận được câu hỏi)
  const select = board.select;
  return (
    <section className="host-game host-game--select">
      <HostBar badge={turnBadge} title={PHASE_LABELS[phase]}>
        {lastTurn}
        {phase === 'BOARD_SELECT' && select && (
          <span className="host-bar__info">
            <b>{select.locked.length}</b>/{select.teamIds.length} nhóm đã chốt
          </span>
        )}
        {phase === 'BOARD_SELECT' && <CountdownRing endsAt={select?.endsAt ?? game.phaseEndsAt} startedAt={select?.startedAt} />}
      </HostBar>
      <div className="host-game__main">
        <HexBoard owners={board.owners} shields={board.shields} targets={board.targets} />
      </div>
      <aside className="host-game__side">
        {phase === 'BOARD_SELECT' && <p className="host-hint">📱 Các nhóm đang chọn ô mục tiêu trên điện thoại…</p>}
        {standings}
      </aside>
    </section>
  );
}
