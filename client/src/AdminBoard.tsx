import { useEffect, useState } from 'react';
import { DEFAULT_BOARD_TURNS, MAX_BOARD_TURNS, type GameView } from '@cnxh/shared';
import { PHASE_LABELS, describeCell } from './boardText';
import { useCountdown } from './clock';
import { HexBoard } from './HexBoard';
import { socket } from './socket';
import { Standings } from './Standings';

/** Điều khiển Bàn Cờ trên /admin (GAME_SPEC 3.6, 5.3): bắt đầu, số lượt N, "Kết thúc sau lượt này". */
export function AdminBoard({ game, onNotice }: { game: GameView | null; onNotice: (msg: string) => void }) {
  const [turns, setTurns] = useState(DEFAULT_BOARD_TURNS);
  const board = game?.board ?? null;
  const inPlay = !!board && !!game && game.phase.startsWith('BOARD_');
  const left = useCountdown(inPlay ? game!.phaseEndsAt : null);
  // Ô "Số lượt" theo N thật khi đang chơi.
  const actualTurns = inPlay ? board!.totalTurns : null;
  useEffect(() => {
    if (actualTurns !== null) setTurns(actualTurns);
  }, [actualTurns]);

  const report = (what: string) => (res: { ok: boolean; error?: string }) => onNotice(res.ok ? '' : `${what} (${res.error}).`);

  return (
    <section className="admin-board">
      <h2>Bàn Cờ Quyền Lực</h2>
      {!inPlay ? (
        <div className="admin-actions">
          <label className="admin-inline">
            Số lượt
            <input type="number" min={1} max={MAX_BOARD_TURNS} value={turns} onChange={(e) => setTurns(Number(e.target.value))} />
          </label>
          <button
            className="primary-btn"
            onClick={() => socket.emit('admin:startBoard', { totalTurns: turns }, report('Không bắt đầu được Bàn Cờ'))}
          >
            {game?.phase === 'SUMMARY' ? 'Chơi lại Bàn Cờ' : 'Bắt đầu Bàn Cờ'}
          </button>
        </div>
      ) : (
        <>
          <p className="admin-board__status">
            Lượt <b>{board!.turn}/{board!.totalTurns}</b> · {PHASE_LABELS[game!.phase]} · còn {left} s
            {board!.endAfterThisTurn && <b> · sẽ kết thúc sau lượt này</b>}
          </p>
          <div className="admin-actions">
            <label className="admin-inline">
              Số lượt
              <input type="number" min={board!.turn} max={MAX_BOARD_TURNS} value={turns} onChange={(e) => setTurns(Number(e.target.value))} />
            </label>
            <button
              className="primary-btn"
              onClick={() => socket.emit('admin:setBoardTurns', { totalTurns: turns }, report('Không đổi được số lượt'))}
            >
              Đổi số lượt
            </button>
            <button
              className={`primary-btn ${board!.endAfterThisTurn ? '' : 'primary-btn--danger'}`}
              onClick={() =>
                socket.emit('admin:endBoardAfterTurn', { value: !board!.endAfterThisTurn }, report('Không đổi được'))
              }
            >
              {board!.endAfterThisTurn ? 'Hủy kết thúc sớm' : 'Kết thúc sau lượt này'}
            </button>
          </div>
        </>
      )}
      {board && (
        <div className="admin-board__view">
          <HexBoard owners={board.owners} shields={board.shields} targets={board.targets} outcome={board.outcome} className="hex-board--admin" />
          <div>
            <Standings standings={board.standings} shields={board.shields} lockedTeamIds={game!.phase === 'BOARD_SELECT' ? board.select?.locked : undefined} />
            {board.outcome && (
              <ul className="admin-board__log">
                {board.outcome.cells.map((o) => <li key={o.cellId}>{describeCell(o)}</li>)}
                {board.outcome.ignored.map((x) => <li key={`i${x.teamId}`}>Nhóm {x.teamId}: mục tiêu không hợp lệ ({x.reason})</li>)}
              </ul>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
