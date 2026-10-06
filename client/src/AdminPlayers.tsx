import { useState } from 'react';
import { TEAM_IDS, namedCaptainInfo, rosterChanges, type CaptainRoster, type RoomState, type RosterTeamStatus } from '@cnxh/shared';
import { RosterEditor, RosterStatusLine, applyRoster, namedCaptainLine, setCaptain } from './AdminRoster';
import { socket } from './socket';
import { teamName, teamStyle } from './teams';

/**
 * Người chơi theo nhóm, dạng gọn: mỗi người một "chip" tên; chạm vào tên mới hiện thao tác
 * (làm đội trưởng, chuyển nhóm — GAME_SPEC 5.3) để 60 người vẫn vừa một màn hình.
 * Mỗi nhóm có ô "★ Đội trưởng" và một dòng tình trạng: nhóm trưởng tự nhận bằng tên là số nhóm (cách chính),
 * hoặc so với danh sách nhóm trưởng thực tế (dự phòng) — GAME_SPEC 2.1.
 */
export function AdminPlayers({
  state,
  roster,
  onRosterChange,
  statuses,
  onNotice,
}: {
  state: RoomState;
  roster: CaptainRoster;
  onRosterChange: (next: CaptainRoster) => void;
  /** `rosterStatus(roster, state)` — tính một lần ở AdminPage. */
  statuses: readonly RosterTeamStatus[];
  onNotice: (msg: string) => void;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const total = state.teams.reduce((n, t) => n + t.players.length, 0);
  const online = state.teams.reduce((n, t) => n + t.players.filter((p) => p.online).length, 0);
  const all = state.teams.flatMap((t) => t.players.map((p) => ({ ...p, teamId: t.id })));
  const selected = all.find((p) => p.id === openId);
  const nameOf = (id: string) => all.find((p) => p.id === id)?.name ?? '?';
  const changes = rosterChanges(statuses);
  const named = namedCaptainInfo(state);
  const playing = state.teams.filter((t) => t.players.length > 0);
  // Nhóm có đội trưởng là người đặt tên là số nhóm.
  const namedOk = playing.filter((t) => t.players.some((p) => p.isDesignatedCaptain && named.find((x) => x.teamId === t.id)!.inTeam.includes(p.id))).length;

  return (
    <section className="admin-card admin-players">
      <h2>
        Người chơi <span className="admin-count">{online}/{total} online</span>
        <span className="admin-muted admin-players__tip">Chạm vào tên để đổi đội trưởng hoặc chuyển nhóm</span>
      </h2>
      <div className="roster-bar">
        <b className="roster-bar__title">
          <span className="captain-star">★</span> Đội trưởng
        </b>
        <span className="admin-muted">
          Dặn nhóm trưởng nhập tên là <b>số nhóm</b> (Nhóm 1 → “1”) là tự làm đội trưởng
          {playing.length > 0 && ` — ${namedOk}/${playing.length} nhóm đã có`}.
        </span>
        <span className="admin-controls__spacer" />
        {statuses.length > 0 && (
          <button className="mini-btn mini-btn--primary" disabled={changes.length === 0} onClick={() => applyRoster(statuses, onNotice)}>
            ★ Đặt theo danh sách{changes.length > 0 && ` (${changes.length} nhóm)`}
          </button>
        )}
        <button className="mini-btn" aria-expanded={editing} onClick={() => setEditing(!editing)}>
          {editing ? 'Xong' : Object.values(roster).some((n) => n?.trim()) ? 'Sửa danh sách nhóm trưởng' : 'Danh sách nhóm trưởng (dự phòng)'}
        </button>
      </div>
      {editing && <RosterEditor roster={roster} onChange={onRosterChange} />}
      <div className="admin-teams">
        {state.teams.map((t) => {
          const captain = t.players.find((p) => p.isDesignatedCaptain);
          const status = statuses.find((s) => s.teamId === t.id);
          const namedLine = namedCaptainLine(named.find((x) => x.teamId === t.id)!, t, nameOf, onNotice);
          return (
            <section key={t.id} className="admin-team" style={teamStyle(t.id)}>
              <h3>
                {teamName(t.id)} <span>{t.players.length}</span>
              </h3>
              {t.players.length > 0 && (
                <label className="team-captain">
                  <span className="captain-star" aria-hidden>
                    ★
                  </span>
                  <select
                    className="mini-select"
                    aria-label={`Đội trưởng ${teamName(t.id)}`}
                    value={captain?.id ?? ''}
                    onChange={(e) => setCaptain(e.target.value, onNotice)}
                  >
                    {!captain && <option value="">—</option>}
                    {t.players.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                        {p.online ? '' : ' (mất kết nối)'}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {namedLine ??
                (status ? (
                  <RosterStatusLine status={status} nameOf={nameOf} onNotice={onNotice} />
                ) : (
                  t.players.length > 0 && <p className="roster-line">Chưa ai đặt tên “{t.id}” — tạm: người vào nhóm đầu tiên</p>
                ))}
              {t.players.length === 0 ? (
                !status && !namedLine && <p className="admin-muted">Chưa có ai.</p>
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
          );
        })}
      </div>
      {selected && (
        <div className="player-menu" style={teamStyle(selected.teamId)}>
          <b>{selected.name}</b>
          <span className="admin-muted">{teamName(selected.teamId)}{selected.online ? '' : ' · mất kết nối'}</span>
          <button
            className="mini-btn"
            disabled={selected.isDesignatedCaptain}
            onClick={() => setCaptain(selected.id, onNotice)}
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
