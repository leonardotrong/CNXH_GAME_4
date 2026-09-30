import { useEffect, useState } from 'react';
import type { GameView, PublicQuestionView, TeamPassView, TeamQuestionView } from '@cnxh/shared';
import { PHASE_LABELS, describeExplosion } from './boardText';
import { useCountdown } from './clock';
import { HexBoard } from './HexBoard';
import { BOMB_RULES, BombBadge, PassArrow } from './HostBomb';
import { PlayQuestion, VOTE_ERRORS } from './PlayQuestion';
import { socket } from './socket';
import { Standings } from './Standings';
import { TEAM_COLORS, teamName } from './teams';

/** Điện thoại trong Quả Bom (GAME_SPEC 4, 5.2): nhóm cầm bom trả lời/chuyền; nhóm khác chỉ xem. */
export function PlayBomb({
  game,
  question,
  teamVotes,
  teamPass,
  playerId,
  teamId,
}: {
  game: GameView;
  question: PublicQuestionView | null;
  teamVotes: TeamQuestionView | null;
  teamPass: TeamPassView | null;
  playerId: string;
  teamId: number;
}) {
  const board = game.board!;
  const bomb = game.bomb!;
  const { phase } = game;
  const holding = bomb.holder === teamId;
  const lastExplosion = bomb.explosions.at(-1);

  // Rung khi bom chuyền tới nhóm mình.
  const passKey = bomb.lastPass ? `${bomb.bombNumber}:${bomb.lastPass.from}>${bomb.lastPass.to}` : `${bomb.bombNumber}`;
  useEffect(() => {
    if (holding && phase === 'BOMB_QUESTION') navigator.vibrate?.([150, 80, 150]);
  }, [passKey, holding]);

  return (
    <section className="play-board">
      <p className="play-board__turn">
        Quả bom {bomb.bombNumber}/{bomb.totalBombs} · {PHASE_LABELS[phase] ?? ''}
      </p>
      {phase !== 'BOMB_EXPLODE' && (
        <p className="bomb-status">
          {holding ? 'Nhóm bạn đang cầm bom! ' : 'Đang cầm bom: '}
          <BombBadge bomb={bomb} />
        </p>
      )}

      {phase === 'BOMB_INTRO' && (
        <ol className="bomb-rules">
          {BOMB_RULES.map((r) => <li key={r}>{r}</li>)}
        </ol>
      )}

      {phase === 'BOMB_QUESTION' && <PassArrow bomb={bomb} />}
      {(phase === 'BOMB_QUESTION' || phase === 'BOMB_REVEAL') && question && (
        <PlayQuestion view={question} team={teamVotes} playerId={playerId} readOnly={!question.teamIds.includes(teamId)} />
      )}

      {phase === 'BOMB_PASS' &&
        (holding ? (
          <PassVote game={game} teamPass={teamPass} playerId={playerId} />
        ) : (
          <p className="play-board__target">{teamName(bomb.holder)} trả lời đúng và đang chọn nhóm nhận bom…</p>
        ))}

      {phase === 'BOMB_EXPLODE' && lastExplosion && (
        <div className={`play-board__outcome ${lastExplosion.teamId === teamId ? 'is-wrong' : ''}`}>
          <p className="bomb-explode">💥 BÙM!</p>
          <strong>{lastExplosion.teamId === teamId ? `Nhóm bạn mất ${lastExplosion.cells.length} ô!` : describeExplosion(lastExplosion)}</strong>
        </div>
      )}

      <HexBoard
        className="hex-board--mini"
        owners={board.owners}
        bombTeam={phase === 'BOMB_EXPLODE' ? null : bomb.holder}
        blasted={phase === 'BOMB_EXPLODE' ? lastExplosion?.cells : undefined}
        label="Bản đồ và nhóm cầm bom"
      />
      {(phase === 'BOMB_INTRO' || phase === 'BOMB_EXPLODE') && (
        <Standings
          standings={board.standings}
          highlight={teamId}
          activeTeamIds={board.standings.filter((s) => s.cells > 0 || s.correct > 0).map((s) => s.teamId)}
        />
      )}
    </section>
  );
}

/** Nhóm cầm bom biểu quyết chọn nhóm nhận bom. */
function PassVote({ game, teamPass, playerId }: { game: GameView; teamPass: TeamPassView | null; playerId: string }) {
  const pass = game.bomb!.pass;
  const left = useCountdown(game.phaseEndsAt);
  const [error, setError] = useState('');
  const mine = pass && teamPass?.roundId === pass.roundId ? teamPass : null;
  const open = pass?.status === 'open' && !!mine && !mine.locked;
  const isCaptain = mine?.captainId === playerId;
  const myVote = mine?.votes[playerId];

  useEffect(() => setError(''), [pass?.roundId]);

  const vote = (to: number) =>
    socket.emit('player:vote', { roundId: pass!.roundId, option: to }, (res) => setError(res.ok ? '' : VOTE_ERRORS[res.error] ?? ''));
  const lock = () =>
    socket.emit('player:lock', { roundId: pass!.roundId }, (res) => setError(res.ok ? '' : VOTE_ERRORS[res.error] ?? ''));

  return (
    <div className="play-select">
      <div className="play-question__timer">{left} s</div>
      <p className="play-select__note">Đúng rồi! Chọn nhóm nhận bom:</p>
      <div className="bomb-targets">
        {(mine?.validTargets ?? pass?.validTargets ?? []).map((t) => {
          const classes = ['option-btn'];
          if (myVote === t) classes.push('is-mine');
          if (mine?.locked && mine.choice === t) classes.push('is-chosen');
          return (
            <button key={t} className={classes.join(' ')} disabled={!open} onClick={() => vote(t)} style={{ borderLeft: `12px solid ${TEAM_COLORS[t]}` }}>
              <b>💣</b>
              <span>{teamName(t)}</span>
              <span className="option-btn__count">{mine?.tally[t] ?? 0}</span>
            </button>
          );
        })}
      </div>
      {mine && (
        <p className="play-question__status">
          {mine.locked ? 'Nhóm đã chốt!' : `${mine.votedOnlineCount}/${mine.onlineCount} thành viên online đã bỏ phiếu`}
        </p>
      )}
      {isCaptain && open && (
        <button className="lock-btn" disabled={!mine?.canLock} onClick={lock}>
          CHỐT
        </button>
      )}
      {error && <p className="form-error" role="alert">{error}</p>}
    </div>
  );
}
