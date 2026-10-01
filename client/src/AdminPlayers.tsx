import { useState } from 'react';
import { TEAM_IDS, type RoomState } from '@cnxh/shared';
import { socket } from './socket';
import { teamName, teamStyle } from './teams';

/**
 * Người chơi theo nhóm, dạng gọn: mỗi người một "chip" tên; chạm vào tên mới hiện thao tác
 * (làm đội trưởng, chuyển nhóm — GAME_SPEC 5.3) để 60 người vẫn vừa một màn hình.
 */
export function AdminPlayers({ state }: { state: RoomState }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const total = state.teams.reduce((n, t) => n + t.players.length, 0);
  const online = state.teams.reduce((n, t) => n + t.players.filter((p) => p.online).length, 0);
  const selected = state.teams.flatMap((t) => t.players.map((p) => ({ ...p, teamId: t.id }))).find((p) => p.id === openId);

  return (
    <section className="admin-card admin-players">
      <h2>
        Người chơi <span className="admin-count">{online}/{total} online</span>
        <span className="admin-muted admin-players__tip">Chạm vào tên để đổi đội trưởng hoặc chuyển nhóm</span>
      </h2>
      <div className="admin-teams">
        {state.teams.map((t) => (
          <section key={t.id} className="admin-team" style={teamStyle(t.id)}>
            <h3>
              {teamName(t.id)} <span>{t.players.length}</span>
            </h3>
            {t.players.length === 0 ? (
              <p className="admin-muted">Chưa có ai.</p>
            ) : (
              <ul className="player-chips">
                {t.players.map((p) => (
                  <li key={p.id}>
                    <button
                      className={['player-chip', p.online ? '' : 'is-offline', p.id === openId ? 'is-open' : ''].join(' ')}
                      onClick={() => setOpenId(p.id === openId ? null : p.id)}
                      title={p.online ? 'Đang online' : 'Mất kết nối'}
                    >
                      {p.isDesignatedCaptain && <span className="captain-star">★</span>}
                      {p.name}
                      {p.isCaptain && !p.isDesignatedCaptain && <em> (tạm)</em>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>
      {selected && (
        <div className="player-menu" style={teamStyle(selected.teamId)}>
          <b>{selected.name}</b>
          <span className="admin-muted">{teamName(selected.teamId)}{selected.online ? '' : ' · mất kết nối'}</span>
          <button
            className="mini-btn"
            disabled={selected.isDesignatedCaptain}
            onClick={() => socket.emit('admin:setCaptain', { playerId: selected.id }, () => {})}
          >
            {selected.isDesignatedCaptain ? '★ Đang là đội trưởng' : 'Làm đội trưởng'}
          </button>
          <label className="admin-inline">
            Chuyển sang
            <select
              className="mini-select"
              value={selected.teamId}
              onChange={(e) => socket.emit('admin:movePlayer', { playerId: selected.id, teamId: Number(e.target.value) }, () => {})}
            >
              {TEAM_IDS.map((id) => (
                <option key={id} value={id}>
                  {teamName(id)}
                </option>
              ))}
            </select>
          </label>
          <button className="mini-btn" onClick={() => setOpenId(null)}>
            Đóng
          </button>
        </div>
      )}
    </section>
  );
}
