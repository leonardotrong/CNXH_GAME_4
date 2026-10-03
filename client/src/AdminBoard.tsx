import { useEffect, useState } from 'react';
import { CELLS, DEFAULT_BOARD_TURNS, MAX_BOARD_TURNS, TEAM_IDS, cellLabel, type CellId, type GameView } from '@cnxh/shared';
import { describeCell, describeExplosion, isBombPhase } from './boardText';
import { TeamTag } from './TeamTag';
import { teamName, teamStyle } from './teams';
import { HexBoard } from './HexBoard';
import { socket } from './socket';
import { Standings } from './Standings';

/** Điều khiển Bàn Cờ trên /admin (GAME_SPEC 3.6, 5.3): bắt đầu, số lượt N, "Kết thúc sau lượt này". */
export function AdminBoard({ game, onNotice }: { game: GameView | null; onNotice: (msg: string) => void }) {
  const [turns, setTurns] = useState(DEFAULT_BOARD_TURNS);
  const board = game?.board ?? null;
  const inPlay = !!board && !!game && game.phase.startsWith('BOARD_');
  const bombPhase = !!game?.bomb && isBombPhase(game.phase);
  const [editing, setEditing] = useState(false);
  const [focused, setFocused] = useState<CellId | null>(null);
  const canEdit = !!board && game!.phase !== 'BOARD_SELECT';
  const allCells = CELLS.map((c) => c.id);
  // Ô "Số lượt" theo N thật khi đang chơi.
  const actualTurns = inPlay ? board!.totalTurns : null;
  useEffect(() => {
    if (actualTurns !== null) setTurns(actualTurns);
  }, [actualTurns]);

  const report = (what: string) => (res: { ok: boolean; error?: string }) => onNotice(res.ok ? '' : `${what} (${res.error}).`);

  return (
    <section className="admin-card admin-board">
      <h2>{bombPhase ? 'Quả Bom Tham Nhũng' : 'Bàn Cờ Quyền Lực'}</h2>
      {game?.phase === 'BOMB_INTRO' ? (
        <p className="admin-board__status">
          Nhóm cầm bom đầu tiên: <TeamTag teamId={game.bomb!.holder} />
        </p>
      ) : bombPhase ? null /* Trạng thái quả bom nằm ở thẻ "Bước tiếp theo". */ : !inPlay ? (
        !board && <p className="admin-muted">Bàn cờ hiện ra khi bắt đầu Bàn Cờ.</p>
      ) : (
        <>
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
          <div>
            <HexBoard
              owners={board.owners}
              shields={board.shields}
              stars={board.stars}
              targets={board.targets}
              outcome={board.outcome}
              bombTeam={game?.bomb && game.phase.startsWith('BOMB_') && game.phase !== 'BOMB_EXPLODE' ? game.bomb.holder : null}
              className="hex-board--admin"
              showIds
              selectable={editing && canEdit ? allCells : undefined}
              onCellClick={editing && canEdit ? setFocused : undefined}
              focused={editing ? focused : null}
              label="Bàn cờ (admin)"
            />
            <div className="admin-actions">
              <button
                className={`primary-btn ${editing ? 'primary-btn--danger' : ''}`}
                disabled={!canEdit && !editing}
                onClick={() => {
                  setEditing(!editing);
                  setFocused(null);
                }}
              >
                {editing ? 'Xong chỉnh tay' : 'Chỉnh tay chủ ô'}
              </button>
            </div>
            {editing && !canEdit && <p className="form-error">Không chỉnh được trong pha chọn ô.</p>}
            {editing && canEdit && focused !== null && (
              <div className="admin-owner">
                <p>
                  {cellLabel(focused)} — chủ hiện tại: <b>{board.owners[focused] === null ? 'ô trống' : teamName(board.owners[focused]!)}</b>
                </p>
                <div className="admin-owner__buttons">
                  <button onClick={() => socket.emit('admin:setCellOwner', { cellId: focused, owner: null }, report('Không đổi được chủ ô'))}>
                    Ô trống
                  </button>
                  {TEAM_IDS.map((t) => (
                    <button
                      key={t}
                      className="is-team"
                      style={teamStyle(t)}
                      onClick={() => socket.emit('admin:setCellOwner', { cellId: focused, owner: t }, report('Không đổi được chủ ô'))}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {editing && canEdit && focused === null && <p className="admin-muted">Chạm vào một ô để đổi chủ.</p>}
          </div>
          <div>
            <Standings standings={board.standings} shields={board.shields} lockedTeamIds={game!.phase === 'BOARD_SELECT' ? board.select?.locked : undefined} />
            {board.outcome && (
              <ul className="admin-board__log">
                {board.outcome.cells.map((o) => <li key={o.cellId}>{describeCell(o)}</li>)}
                {board.outcome.ignored.map((x) => <li key={`i${x.teamId}`}>Nhóm {x.teamId}: mục tiêu không hợp lệ ({x.reason})</li>)}
              </ul>
            )}
            {game?.bomb && game.bomb.explosions.length > 0 && (
              <ul className="admin-board__log">
                {game.bomb.explosions.map((e) => (
                  <li key={e.bombNumber}>Quả {e.bombNumber}: {describeExplosion(e)} (ô {e.cells.join(', ') || '—'})</li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
