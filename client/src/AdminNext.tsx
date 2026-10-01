import { useState, type ReactNode } from 'react';
import { MAX_BOARD_TURNS, MAX_BOMB_COUNT, type GameView, type PublicQuestionView } from '@cnxh/shared';
import { PHASE_LABELS } from './boardText';
import { useCountdown } from './clock';
import { Icon } from './Icon';
import { DEFAULT_STEP_OPTIONS, STAGES, nextStep, stageOf, type StepOptions } from './nextStep';
import { socket } from './socket';
import { TeamTag } from './TeamTag';

/**
 * Thẻ điều khiển chính của /admin: thanh tiến trình 5 chặng + MỘT nút "Bước tiếp theo"
 * (cùng logic với phím Space trên /host) + tạm dừng.
 */
export function AdminNext({
  hasRoom,
  game,
  question,
  onNotice,
}: {
  hasRoom: boolean;
  game: GameView | null;
  question: PublicQuestionView | null;
  onNotice: (msg: string) => void;
}) {
  const [opts, setOpts] = useState<StepOptions>(DEFAULT_STEP_OPTIONS);
  const [busy, setBusy] = useState(false);
  const step = nextStep(hasRoom, game, question);
  const stage = stageOf(game?.phase);
  const left = useCountdown(game?.phaseEndsAt ?? null);
  const paused = game?.pausedAt != null;
  const inMatch = !!game && game.phase !== 'LOBBY' && game.phase !== 'SUMMARY' && game.phase !== 'RULES';

  const go = () => {
    if (!step.run || busy) return;
    // Đang mất kết nối: không xếp hàng lệnh — lúc kết nối lại, lệnh sẽ tới trước khi kịp đăng nhập lại và bị từ chối.
    if (!socket.connected) return onNotice('Đang mất kết nối tới máy chủ — chờ kết nối lại rồi bấm.');
    setBusy(true);
    step.run(opts, (res) => {
      setBusy(false);
      onNotice(
        res.ok
          ? ''
          : res.error === 'NETWORK'
            ? `Mạng chập chờn khi gửi "${step.label}" — xem màn chiếu, chưa đổi thì bấm lại.`
            : `Không thực hiện được "${step.label}" (${res.error}).`,
      );
    });
  };

  return (
    <section className={`admin-card admin-next ${paused ? 'is-paused' : ''}`}>
      {hasRoom && (
        <ol className="stepper" aria-label="Tiến trình buổi chơi">
          {STAGES.map((name, i) => (
            <li key={name} className={i < stage ? 'is-done' : i === stage ? 'is-current' : ''}>
              <span className="stepper__dot">{i < stage ? <Icon name="check" /> : i + 1}</span>
              <span className="stepper__name">{name}</span>
            </li>
          ))}
        </ol>
      )}

      <div className="admin-next__row">
        <div className="admin-next__main">
          {game && hasRoom && <Status game={game} left={left} />}
          <button className={`next-btn ${step.run ? '' : 'is-waiting'}`} disabled={!step.run || busy} onClick={go}>
            {step.run ? <Icon name="play" /> : <span className="next-btn__spinner" aria-hidden />}
            <span>{step.label}</span>
          </button>
          <p className="admin-next__hint">{step.hint}</p>
          {step.setting === 'turns' && (
            <label className="admin-inline">
              Số lượt
              <input
                type="number"
                min={1}
                max={MAX_BOARD_TURNS}
                value={opts.turns}
                onChange={(e) => setOpts({ ...opts, turns: Number(e.target.value) })}
              />
              <span className="admin-muted">≈ {Math.round((opts.turns * 45) / 60)} phút</span>
            </label>
          )}
          {step.setting === 'bombs' && (
            <label className="admin-inline">
              Số bom
              <input
                type="number"
                min={1}
                max={MAX_BOMB_COUNT}
                value={opts.bombs}
                onChange={(e) => setOpts({ ...opts, bombs: Number(e.target.value) })}
              />
              {game?.bomb && (
                <span>
                  Cầm đầu tiên: <TeamTag teamId={game.bomb.holder} />
                </span>
              )}
            </label>
          )}
        </div>
        {inMatch && (
          <button
            className={`primary-btn admin-next__pause ${paused ? 'primary-btn--gold' : 'primary-btn--ghost'}`}
            onClick={() => socket.emit('admin:setPaused', { paused: !paused }, (res) => onNotice(res.ok ? '' : `Không đổi được tạm dừng (${res.error}).`))}
          >
            <Icon name={paused ? 'play' : 'pause'} />
            {paused ? 'Tiếp tục' : 'Tạm dừng'}
          </button>
        )}
      </div>
    </section>
  );
}

/** Một dòng trạng thái: lượt/quả bom hiện tại, pha, thời gian còn lại. */
function Status({ game, left }: { game: GameView; left: number }) {
  const parts: ReactNode[] = [];
  if (game.phase.startsWith('BOARD_') && game.board) {
    parts.push(
      <span key="turn">
        Lượt <b>{game.board.turn}/{game.board.totalTurns}</b>
        {game.board.endAfterThisTurn && ' (lượt cuối)'}
      </span>,
    );
  }
  if (game.phase.startsWith('BOMB_') && game.phase !== 'BOMB_INTRO' && game.bomb) {
    parts.push(
      <span key="bomb">
        Quả <b>{game.bomb.bombNumber}/{game.bomb.totalBombs}</b> · cầm: <TeamTag teamId={game.bomb.holder} /> · bom{' '}
        {game.bomb.burning ? 'đang cháy' : 'tạm dừng'}
        {/* Người dẫn cũng không biết ngòi: server không gửi. */}
      </span>,
    );
  }
  parts.push(<span key="phase">{PHASE_LABELS[game.phase] ?? game.phase}</span>);
  if (game.phaseEndsAt !== null) parts.push(<b key="left" className="admin-next__left">{left} s</b>);
  if (game.pausedAt !== null) parts.push(<b key="paused" className="admin-next__paused">TẠM DỪNG</b>);
  return <p className="admin-next__status">{parts.flatMap((p, i) => (i === 0 ? [p] : [<i key={`s${i}`}>·</i>, p]))}</p>;
}
