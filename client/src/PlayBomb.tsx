import { useEffect, useState, type CSSProperties } from 'react';
import type { GameView, PublicQuestionView, TeamPassView, TeamQuestionView } from '@cnxh/shared';
import { PHASE_LABELS, describeExplosion } from './boardText';
import { BombIcon } from './BombIcon';
import { CountdownRing } from './Countdown';
import { Icon } from './Icon';
import { HexBoard } from './HexBoard';
import { BOMB_RULES, BombBadge, PassArrow } from './HostBomb';
import { PlayQuestion, VOTE_ERRORS } from './PlayQuestion';
import { ACK_TIMEOUT_MS, orNetworkError, socket } from './socket';
import { Standings } from './Standings';
import { TerritoryBar } from './TerritoryBar';
import { Swatch } from './TeamTag';
import { teamName, teamStyle } from './teams';
import { VoteStatus } from './VoteControls';

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

  const activeTeams = board.standings.filter((s) => s.cells > 0 || s.correct > 0).map((s) => s.teamId);

  return (
    <section className="play-board">
      <p className="play-phase">
        Quả bom {bomb.bombNumber}/{bomb.totalBombs} · {PHASE_LABELS[phase] ?? ''}
      </p>
      <TerritoryBar owners={board.owners} />
      {phase !== 'BOMB_EXPLODE' &&
        (holding ? (
          <div className={`bomb-alert ${bomb.burning ? 'is-burning' : ''}`}>
            <BombIcon burning={bomb.burning} />
            <span>
              <strong>Nhóm bạn đang cầm bom!</strong>
              <span>
                {phase === 'BOMB_PASS'
                  ? 'Trả lời đúng rồi — chọn nhóm nhận bom.'
                  : phase === 'BOMB_INTRO'
                    ? 'Nhóm dẫn đầu cầm quả bom đầu tiên.'
                    : 'Trả lời đúng để chuyền bom đi!'}
              </span>
            </span>
          </div>
        ) : (
          <p className="bomb-watch">
            <span>Đang cầm bom</span>
            <BombBadge bomb={bomb} />
          </p>
        ))}

      {phase === 'BOMB_INTRO' && (
        <ol className="play-bomb-rules">
          {BOMB_RULES.map((r) => (
            <li key={r.text}>
              <Icon name={r.icon} className="play-rules__icon" />
              <span>{r.text}</span>
            </li>
          ))}
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
          <p className="play-note">
            {teamName(bomb.holder)} trả lời đúng và đang chọn nhóm nhận bom
            <span className="dots" aria-hidden>
              <i />
              <i />
              <i />
            </span>
          </p>
        ))}

      {phase === 'BOMB_EXPLODE' && lastExplosion && (
        <div className={`play-explode ${lastExplosion.teamId === teamId ? 'is-mine' : ''}`} style={teamStyle(lastExplosion.teamId)}>
          <p className="play-explode__boom">BÙM!</p>
          <strong>{lastExplosion.teamId === teamId ? `Nhóm bạn mất ${lastExplosion.cells.length} ô!` : describeExplosion(lastExplosion)}</strong>
        </div>
      )}

      <HexBoard
        className="hex-board--mini"
        owners={board.owners}
        stars={board.stars}
        bombTeam={phase === 'BOMB_EXPLODE' ? null : bomb.holder}
        blasted={phase === 'BOMB_EXPLODE' ? lastExplosion?.cells : undefined}
        label="Bản đồ và nhóm cầm bom"
      />
      {(phase === 'BOMB_INTRO' || phase === 'BOMB_EXPLODE') && <Standings standings={board.standings} highlight={teamId} activeTeamIds={activeTeams} />}
    </section>
  );
}

/** Nhóm cầm bom biểu quyết chọn nhóm nhận bom. */
function PassVote({ game, teamPass, playerId }: { game: GameView; teamPass: TeamPassView | null; playerId: string }) {
  const pass = game.bomb!.pass;
  const [error, setError] = useState('');
  const [pending, setPending] = useState<number | null>(null);
  const mine = pass && teamPass?.roundId === pass.roundId ? teamPass : null;
  const open = pass?.status === 'open' && !!mine && !mine.locked;
  const isCaptain = mine?.captainId === playerId;
  const myVote = pending ?? mine?.votes[playerId];

  useEffect(() => {
    setError('');
    setPending(null);
  }, [pass?.roundId]);
  useEffect(() => {
    if (pending !== null && (mine?.votes[playerId] === pending || mine?.locked)) setPending(null);
  }, [mine, pending, playerId]);

  const vote = (to: number) => {
    navigator.vibrate?.(12);
    setPending(to);
    socket.timeout(ACK_TIMEOUT_MS).emit(
      'player:vote',
      { roundId: pass!.roundId, option: to },
      orNetworkError((res) => {
        if (!res.ok) setPending(null);
        setError(res.ok ? '' : VOTE_ERRORS[res.error] ?? '');
      }),
    );
  };
  const lock = () =>
    socket
      .timeout(ACK_TIMEOUT_MS)
      .emit('player:lock', { roundId: pass!.roundId }, orNetworkError((res) => setError(res.ok ? '' : VOTE_ERRORS[res.error] ?? '')));

  return (
    <div className="play-select">
      <div className="play-task">
        <CountdownRing endsAt={pass?.endsAt ?? game.phaseEndsAt} startedAt={pass?.startedAt} urgentAt={3} />
        <span className="play-task__text">
          <b>Chọn nhóm nhận bom</b>
          <span>Không được chuyền ngược cho nhóm vừa chuyền cho mình.</span>
        </span>
      </div>
      <div className="bomb-targets">
        {(mine?.validTargets ?? pass?.validTargets ?? []).map((t) => {
          const classes = ['option-btn', 'option-btn--team'];
          if (myVote === t) classes.push('is-mine');
          if (mine?.locked && mine.choice === t) classes.push('is-chosen');
          const share = mine && mine.onlineCount > 0 ? Math.min(100, ((mine.tally[t] ?? 0) / mine.onlineCount) * 100) : 0;
          return (
            <button
              key={t}
              className={classes.join(' ')}
              disabled={!open}
              onClick={() => vote(t)}
              style={teamStyle(t, { '--votes': `${share}%` } as CSSProperties)}
            >
              <Swatch teamId={t} />
              <span className="option-btn__text">
                {teamName(t)}
                {mine?.locked && mine.choice === t && <small className="option-btn__chosen">Nhóm đã chốt</small>}
              </span>
              <span className="option-btn__count">{mine?.tally[t] ?? 0}</span>
            </button>
          );
        })}
      </div>
      {mine && <VoteStatus view={mine} lockedText="Nhóm đã chốt nhóm nhận bom!" showLock={isCaptain && open} onLock={lock} />}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
