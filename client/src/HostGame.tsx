import type { GameView, PublicQuestionView, TurnOutcome } from '@cnxh/shared';
import { PHASE_LABELS, describeExplosion, isBombPhase } from './boardText';
import { Confetti } from './Confetti';
import { CountdownRing } from './Countdown';
import { HostBomb } from './HostBomb';
import { AnswerCard, HostBar } from './HostParts';
import { HostLessons } from './HostLessons';
import { HexBoard } from './HexBoard';
import { Icon } from './Icon';
import { OutcomeList } from './Outcome';
import { QuestionPanel } from './QuestionPanel';
import { Standings } from './Standings';
import { teamName, teamStyle } from './teams';

/** Chú giải giá trị ô trên bàn cờ (GAME_SPEC 3.6, 3.7). */
function MapLegend() {
  return (
    <ul className="map-legend" aria-label="Giá trị ô">
      <li>
        <span className="map-legend__swatch is-constitution">
          <Icon name="book" />
        </span>
        Hiến pháp <b>3 điểm</b>
      </li>
      <li>
        <span className="map-legend__swatch is-organ">QH</span>
        Ô Cơ quan <b>2 điểm</b>
      </li>
      <li>
        <span className="map-legend__swatch is-star">
          <Icon name="star" />
        </span>
        Ô ★ <b>2 điểm</b>
      </li>
    </ul>
  );
}

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
      Lượt {board.turn}/{board.totalTurns}
      {board.endAfterThisTurn && phase !== 'SUMMARY' && <span className="host-bar__flag"> · lượt cuối</span>}
    </>
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
        <HostBar badge={turnBadge} owners={board.owners} title={PHASE_LABELS[phase]}>
          {question.status === 'open' && <CountdownRing endsAt={question.endsAt} startedAt={question.startedAt} />}
        </HostBar>
        <div className="host-game__main">
          <QuestionPanel view={question} activeTeamIds={activeTeamIds} showTimer={false} />
        </div>
        <aside className="host-game__side">
          <HexBoard owners={board.owners} shields={board.shields} stars={board.stars} targets={board.targets} label="Bàn cờ và mục tiêu các nhóm" />
        </aside>
      </section>
    );
  }

  if (phase === 'BOARD_REVEAL') {
    const outcome = board.outcome;
    return (
      <section className="host-game host-game--reveal">
        <HostBar badge={turnBadge} owners={board.owners} title={PHASE_LABELS[phase]} />
        <div className="host-game__main">
          <HexBoard owners={board.owners} shields={board.shields} stars={board.stars} targets={board.targets} outcome={outcome} />
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
        <HostBar badge="Chung cuộc" title="Bàn Cờ Quyền Lực & Quả Bom Tham Nhũng" owners={board.owners} />
        <div className="host-game__main">
          <ol className="podium">
            {podium.map((s) => (
              <li key={s.teamId} className={`podium__step podium__step--${Math.min(s.rank, 3)}`} style={teamStyle(s.teamId)}>
                <span className="podium__team">{teamName(s.teamId)}</span>
                <span className="podium__score">{s.score} điểm</span>
                <span className="podium__block">{s.rank}</span>
              </li>
            ))}
          </ol>
          <Standings standings={board.standings} shields={board.shields} activeTeamIds={activeTeamIds} showMeta />
        </div>
        <aside className="host-game__side">
          <HexBoard owners={board.owners} stars={board.stars} />
          {game.bomb && game.bomb.explosions.length > 0 && (
            <ul className="bomb-log">
              {game.bomb.explosions.map((e) => (
                <li key={e.bombNumber}>
                  Quả {e.bombNumber}: {describeExplosion(e)}
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
      <HostBar badge={turnBadge} owners={board.owners} title={PHASE_LABELS[phase]}>
        {phase === 'BOARD_SELECT' && select && (
          <span className="host-bar__info">
            {select.locked.length}/{select.teamIds.length} nhóm đã chốt
          </span>
        )}
        {phase === 'BOARD_SELECT' && <CountdownRing endsAt={select?.endsAt ?? game.phaseEndsAt} startedAt={select?.startedAt} />}
      </HostBar>
      <div className="host-game__main">
        <HexBoard
          owners={board.owners}
          shields={board.shields}
          stars={board.stars}
          newStar={phase === 'BOARD_SELECT' ? board.newStar : null}
          targets={board.targets}
        />
      </div>
      <aside className="host-game__side">
        {/* Lượt có ★ mới: băng-rôn thay dòng gợi ý để cột phải không dài thêm. */}
        {phase === 'BOARD_SELECT' &&
          (board.newStar !== null ? (
            <p className="star-banner" role="status">
              <Icon name="star" /> ★ Lòng dân xuất hiện! Ô có ★ được 2 điểm — nhóm nào giành được?
            </p>
          ) : (
            <p className="host-hint">Các nhóm đang chọn ô mục tiêu trên điện thoại…</p>
          ))}
        <MapLegend />
        {standings}
      </aside>
    </section>
  );
}
