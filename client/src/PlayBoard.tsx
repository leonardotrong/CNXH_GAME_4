import { useEffect, useState } from 'react';
import type { CellId, GameView, PublicQuestionView, TeamPassView, TeamQuestionView, TeamSelectView } from '@cnxh/shared';
import { PHASE_LABELS, describeCell, isBombPhase, shieldName } from './boardText';
import { CountdownRing } from './Countdown';
import { Icon } from './Icon';
import { PlayBomb } from './PlayBomb';
import { HexBoard } from './HexBoard';
import { PlayQuestion, VOTE_ERRORS } from './PlayQuestion';
import { ACK_TIMEOUT_MS, orNetworkError, socket } from './socket';
import { Standings } from './Standings';
import { TerritoryBar } from './TerritoryBar';
import { VoteStatus } from './VoteControls';

/** Điện thoại trong trận Bàn Cờ (GAME_SPEC 5.2): chọn ô trên bản đồ thu nhỏ, trả lời câu hỏi, xem kết quả lượt. */
export function PlayBoard({
  game,
  question,
  teamVotes,
  teamSelect,
  teamPass,
  playerId,
  teamId,
}: {
  game: GameView;
  question: PublicQuestionView | null;
  teamVotes: TeamQuestionView | null;
  teamSelect: TeamSelectView | null;
  teamPass: TeamPassView | null;
  playerId: string;
  teamId: number;
}) {
  const board = game.board!;
  const { phase } = game;

  if (isBombPhase(phase) && game.bomb) {
    return <PlayBomb game={game} question={question} teamVotes={teamVotes} teamPass={teamPass} playerId={playerId} teamId={teamId} />;
  }

  const activeTeams = board.standings.filter((s) => s.cells > 0 || s.correct > 0).map((s) => s.teamId);

  return (
    <section className="play-board">
      <p className="play-phase">
        {phase === 'SUMMARY'
          ? 'Trận đã kết thúc'
          : `Lượt ${board.turn}/${board.totalTurns}${board.endAfterThisTurn ? ' (lượt cuối)' : ''} · ${PHASE_LABELS[phase] ?? ''}`}
      </p>
      <TerritoryBar owners={board.owners} />
      {phase === 'BOARD_SELECT' && <PlaySelect game={game} teamSelect={teamSelect} playerId={playerId} teamId={teamId} />}
      {(phase === 'BOARD_QUESTION' || phase === 'BOARD_REVEAL') && (
        <>
          <TeamTurnSummary game={game} teamId={teamId} />
          {question && question.teamIds.includes(teamId) && <PlayQuestion view={question} team={teamVotes} playerId={playerId} />}
          <HexBoard
            className="hex-board--mini"
            owners={board.owners}
            shields={board.shields}
            stars={board.stars}
            targets={board.targets}
            chosen={board.targets?.[teamId] ?? null}
            outcome={board.outcome}
            label="Bản đồ và mục tiêu các nhóm"
          />
        </>
      )}
      {phase === 'SUMMARY' && (
        <>
          <FinalCard game={game} teamId={teamId} />
          <Standings standings={board.standings} highlight={teamId} activeTeamIds={activeTeams} />
          <HexBoard className="hex-board--mini" owners={board.owners} stars={board.stars} />
        </>
      )}
    </section>
  );
}

/** Hạng chung cuộc của nhóm mình. */
function FinalCard({ game, teamId }: { game: GameView; teamId: number }) {
  const mine = game.board!.standings.find((s) => s.teamId === teamId);
  if (!mine) return null;
  return (
    <div className={`final-card ${mine.rank <= 3 ? 'is-podium' : ''}`}>
      <span className="final-card__rank">
        <small>Hạng</small>
        {mine.rank}
      </span>
      <span>
        <b>{mine.score} điểm</b>
        <span>
          {mine.cells} ô · {mine.correct} câu đúng
        </span>
      </span>
    </div>
  );
}

function PlaySelect({
  game,
  teamSelect,
  playerId,
  teamId,
}: {
  game: GameView;
  teamSelect: TeamSelectView | null;
  playerId: string;
  teamId: number;
}) {
  const board = game.board!;
  const select = board.select;
  const [error, setError] = useState('');
  const [pending, setPending] = useState<CellId | null>(null);
  const mine = select && teamSelect?.roundId === select.roundId ? teamSelect : null;
  const inRound = select?.teamIds.includes(teamId) ?? false;
  const open = select?.status === 'open' && !!mine && !mine.locked;
  const isCaptain = mine?.captainId === playerId;
  const myShield = board.shields.filter((s) => s.teamId === teamId);

  // Rung nhẹ khi bắt đầu chọn ô.
  useEffect(() => {
    navigator.vibrate?.(150);
    setError('');
    setPending(null);
  }, [select?.roundId]);
  useEffect(() => {
    if (pending !== null && (mine?.votes[playerId] === pending || mine?.locked)) setPending(null);
  }, [mine, pending, playerId]);

  const vote = (cellId: CellId) => {
    navigator.vibrate?.(12);
    setPending(cellId);
    socket.timeout(ACK_TIMEOUT_MS).emit(
      'player:vote',
      { roundId: select!.roundId, option: cellId },
      orNetworkError((res) => {
        if (!res.ok) setPending(null);
        setError(res.ok ? '' : VOTE_ERRORS[res.error] ?? '');
      }),
    );
  };
  const lock = () =>
    socket
      .timeout(ACK_TIMEOUT_MS)
      .emit('player:lock', { roundId: select!.roundId }, orNetworkError((res) => setError(res.ok ? '' : VOTE_ERRORS[res.error] ?? '')));

  return (
    <div className="play-select">
      <div className="play-task">
        <CountdownRing endsAt={select?.endsAt ?? game.phaseEndsAt} startedAt={select?.startedAt} />
        <span className="play-task__text">
          <b>Chọn ô mục tiêu</b>
          <span>
            {!inRound
              ? 'Nhóm không có ô hợp lệ lượt này — bỏ lượt chọn. Vẫn trả lời câu hỏi để phòng thủ!'
              : open
                ? 'Chạm một ô sáng để bỏ phiếu. Cả nhóm bầu xong là tự chốt.'
                : 'Chờ các nhóm khác chốt…'}
          </span>
        </span>
      </div>
      {board.newStar !== null && (
        <p className="play-note play-note--star">
          <Icon name="star" /> ★ Lòng dân vừa xuất hiện: ô có ★ được 2 điểm — nhanh tay giành lấy!
        </p>
      )}
      {myShield.length > 0 && (
        <p className="play-note play-note--shield">
          <Icon name="shield" /> Nhóm đang có {myShield.map((s) => shieldName(s.reason)).join(' + ')}: không ai tấn công được ô của nhóm lượt này.
        </p>
      )}
      <HexBoard
        className="hex-board--mini"
        owners={board.owners}
        shields={board.shields}
        stars={board.stars}
        newStar={board.newStar}
        selectable={open ? mine!.validTargets : undefined}
        counts={mine?.tally}
        mine={pending ?? mine?.votes[playerId] ?? null}
        chosen={mine?.locked ? mine.choice : null}
        onCellClick={open ? vote : undefined}
        label="Bản đồ chọn ô"
      />
      {mine && (
        <VoteStatus
          view={mine}
          lockedText={mine.choice === null ? 'Nhóm đã chốt: bỏ lượt' : 'Nhóm đã chốt ô mục tiêu (viền đậm)'}
          showLock={isCaptain && open}
          onLock={lock}
          lockLabel="CHỐT Ô"
        />
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

/** Kết quả lượt của nhóm mình (REVEAL) hoặc mục tiêu đã chốt (QUESTION). */
function TeamTurnSummary({ game, teamId }: { game: GameView; teamId: number }) {
  const board = game.board!;
  const outcome = board.outcome;
  if (!outcome) {
    const target = board.targets?.[teamId];
    return (
      <p className="play-note">
        <Icon name={target === undefined || target === null ? 'shield' : 'target'} />
        {target === undefined || target === null
          ? 'Nhóm không nhắm ô nào lượt này — trả lời đúng để phòng thủ.'
          : 'Mục tiêu của nhóm: ô viền đậm trên bản đồ. Trả lời đúng và nhanh!'}
      </p>
    );
  }
  const related = outcome.cells.filter((o) => o.attackers.includes(teamId) || o.previousOwner === teamId);
  const gained = outcome.gains[teamId] ?? 0;
  const lost = outcome.losses[teamId] ?? 0;
  const shields = outcome.shieldsGranted.filter((s) => s.teamId === teamId);
  const tone = gained > lost ? 'is-correct' : lost > gained ? 'is-wrong' : '';
  return (
    <div className={`result-card ${tone}`}>
      <strong>
        <Icon name={gained > lost ? 'flag' : lost > gained ? 'x' : 'equal'} />
        {gained > 0 && `Chiếm được ${gained} ô `}
        {lost > 0 && `Mất ${lost} ô `}
        {gained === 0 && lost === 0 && 'Lãnh thổ giữ nguyên'}
      </strong>
      {(related.length > 0 || shields.length > 0) && (
        <ul>
          {related.map((o) => (
            <li key={o.cellId}>{describeCell(o)}</li>
          ))}
          {shields.map((s) => (
            <li key={s.reason}>Nhóm nhận {shieldName(s.reason)} cho lượt sau</li>
          ))}
        </ul>
      )}
    </div>
  );
}
