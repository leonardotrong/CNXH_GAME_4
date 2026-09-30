import { useEffect, useState } from 'react';
import type { CellId, GameView, PublicQuestionView, TeamQuestionView, TeamSelectView } from '@cnxh/shared';
import { PHASE_LABELS, describeCell, shieldName } from './boardText';
import { useCountdown } from './clock';
import { HexBoard } from './HexBoard';
import { PlayQuestion, VOTE_ERRORS } from './PlayQuestion';
import { socket } from './socket';
import { Standings } from './Standings';

/** Điện thoại trong trận Bàn Cờ (GAME_SPEC 5.2): chọn ô trên bản đồ thu nhỏ, trả lời câu hỏi, xem kết quả lượt. */
export function PlayBoard({
  game,
  question,
  teamVotes,
  teamSelect,
  playerId,
  teamId,
}: {
  game: GameView;
  question: PublicQuestionView | null;
  teamVotes: TeamQuestionView | null;
  teamSelect: TeamSelectView | null;
  playerId: string;
  teamId: number;
}) {
  const board = game.board!;
  const { phase } = game;

  return (
    <section className="play-board">
      <p className="play-board__turn">
        {phase === 'SUMMARY' ? 'Bàn Cờ đã kết thúc' : `Lượt ${board.turn}/${board.totalTurns} · ${PHASE_LABELS[phase] ?? ''}`}
      </p>
      {phase === 'BOARD_SELECT' && (
        <PlaySelect game={game} teamSelect={teamSelect} playerId={playerId} teamId={teamId} />
      )}
      {(phase === 'BOARD_QUESTION' || phase === 'BOARD_REVEAL') && (
        <>
          <TeamTurnSummary game={game} teamId={teamId} />
          {question && question.teamIds.includes(teamId) && (
            <PlayQuestion view={question} team={teamVotes} playerId={playerId} />
          )}
          <HexBoard
            className="hex-board--mini"
            owners={board.owners}
            shields={board.shields}
            targets={board.targets}
            chosen={board.targets?.[teamId] ?? null}
            outcome={board.outcome}
            label="Bản đồ và mục tiêu các nhóm"
          />
        </>
      )}
      {phase === 'SUMMARY' && (
        <>
          <Standings standings={board.standings} highlight={teamId} activeTeamIds={board.standings.filter((s) => s.cells > 0 || s.correct > 0).map((s) => s.teamId)} />
          <HexBoard className="hex-board--mini" owners={board.owners} />
        </>
      )}
    </section>
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
  const left = useCountdown(game.phaseEndsAt);
  const [error, setError] = useState('');
  const mine = select && teamSelect?.roundId === select.roundId ? teamSelect : null;
  const inRound = select?.teamIds.includes(teamId) ?? false;
  const open = select?.status === 'open' && !!mine && !mine.locked;
  const isCaptain = mine?.captainId === playerId;
  const myShield = board.shields.filter((s) => s.teamId === teamId);

  // Rung nhẹ khi bắt đầu chọn ô.
  useEffect(() => {
    navigator.vibrate?.(150);
    setError('');
  }, [select?.roundId]);

  const vote = (cellId: CellId) =>
    socket.emit('player:vote', { roundId: select!.roundId, option: cellId }, (res) =>
      setError(res.ok ? '' : VOTE_ERRORS[res.error] ?? ''),
    );
  const lock = () =>
    socket.emit('player:lock', { roundId: select!.roundId }, (res) => setError(res.ok ? '' : VOTE_ERRORS[res.error] ?? ''));

  return (
    <div className="play-select">
      <div className="play-question__timer">{left} s</div>
      {myShield.length > 0 && (
        <p className="play-select__shield">🛡 Nhóm đang có {myShield.map((s) => shieldName(s.reason)).join(' + ')}: không ai tấn công được ô của nhóm lượt này.</p>
      )}
      {!inRound ? (
        <p className="play-select__note">Nhóm không có ô hợp lệ lượt này — bỏ lượt chọn. Vẫn trả lời câu hỏi để phòng thủ!</p>
      ) : (
        <p className="play-select__note">Chạm vào một ô sáng để bỏ phiếu chọn mục tiêu.</p>
      )}
      <HexBoard
        className="hex-board--mini"
        owners={board.owners}
        shields={board.shields}
        selectable={open ? mine!.validTargets : undefined}
        counts={mine?.tally}
        mine={mine?.votes[playerId] ?? null}
        chosen={mine?.locked ? mine.choice : null}
        onCellClick={open ? vote : undefined}
        label="Bản đồ chọn ô"
      />
      {mine && (
        <p className="play-question__status">
          {mine.locked
            ? mine.choice === null ? 'Nhóm đã chốt: bỏ lượt' : 'Nhóm đã chốt ô mục tiêu (viền đen)'
            : `${mine.votedOnlineCount}/${mine.onlineCount} thành viên online đã bỏ phiếu`}
        </p>
      )}
      {isCaptain && open && (
        <button className="lock-btn" disabled={!mine?.canLock} onClick={lock}>
          CHỐT Ô
        </button>
      )}
      {error && <p className="form-error" role="alert">{error}</p>}
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
      <p className="play-board__target">
        {target === undefined || target === null ? 'Nhóm không nhắm ô nào lượt này — trả lời đúng để phòng thủ.' : 'Mục tiêu của nhóm: ô viền đen trên bản đồ. Trả lời đúng và nhanh!'}
      </p>
    );
  }
  const related = outcome.cells.filter((o) => o.attackers.includes(teamId) || o.previousOwner === teamId);
  const gained = outcome.gains[teamId] ?? 0;
  const lost = outcome.losses[teamId] ?? 0;
  const shields = outcome.shieldsGranted.filter((s) => s.teamId === teamId);
  const tone = gained > lost ? 'is-correct' : lost > gained ? 'is-wrong' : '';
  return (
    <div className={`play-board__outcome ${tone}`}>
      <strong>
        {gained > 0 && `Chiếm được ${gained} ô! `}
        {lost > 0 && `Mất ${lost} ô. `}
        {gained === 0 && lost === 0 && 'Lãnh thổ giữ nguyên.'}
      </strong>
      <ul>
        {related.map((o) => <li key={o.cellId}>{describeCell(o)}</li>)}
        {shields.map((s) => <li key={s.reason}>🛡 Nhóm nhận {shieldName(s.reason)} cho lượt sau</li>)}
      </ul>
    </div>
  );
}
