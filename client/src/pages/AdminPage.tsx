import { useEffect, useState, type FormEvent } from 'react';
import { TEAM_IDS } from '@cnxh/shared';
import { ConnectionBadge } from '../ConnectionBadge';
import { socket, useRoomState } from '../socket';
import { TEAM_COLORS, teamName } from '../teams';

const PW_KEY = 'cnxh.adminPassword';

export function AdminPage() {
  const state = useRoomState();
  const [password, setPassword] = useState('');
  const [authed, setAuthed] = useState(false);
  const [error, setError] = useState('');

  const login = (pw: string) =>
    socket.emit('admin:login', { password: pw }, (res) => {
      if (res.ok) {
        setAuthed(true);
        setError('');
        try { sessionStorage.setItem(PW_KEY, pw); } catch { /* bỏ qua */ }
        socket.emit('admin:watch', {}, () => {});
      } else {
        setAuthed(false);
        setError('Sai mật khẩu.');
      }
    });

  // Đăng nhập lại tự động sau khi mất kết nối / tải lại trang.
  useEffect(() => {
    const auto = () => {
      let pw: string | null = null;
      try { pw = sessionStorage.getItem(PW_KEY); } catch { /* bỏ qua */ }
      if (pw) login(pw);
    };
    socket.on('connect', auto);
    if (socket.connected) auto();
    return () => {
      socket.off('connect', auto);
    };
  }, []);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    login(password);
  };

  if (!authed) {
    return (
      <main className="page page--admin">
        <h1>Bảng điều khiển người dẫn</h1>
        <ConnectionBadge />
        <form className="join-form" onSubmit={submit}>
          <label>
            Mật khẩu
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button type="submit" className="primary-btn">Đăng nhập</button>
        </form>
      </main>
    );
  }

  return (
    <main className="page page--admin">
      <h1>Bảng điều khiển người dẫn</h1>
      <ConnectionBadge />
      <button className="primary-btn" onClick={() => socket.emit('admin:createRoom', () => {})}>
        {state ? 'Tạo phòng mới' : 'Tạo phòng'}
      </button>
      {state && (
        <>
          <p className="admin-code">Mã phòng: <strong>{state.code}</strong></p>
          <button
            className="primary-btn"
            onClick={() => socket.emit('admin:setLobbyOpen', { open: !state.lobbyOpen }, () => {})}
          >
            {state.lobbyOpen ? 'Đóng cổng vào phòng' : 'Mở lại cổng vào phòng'}
          </button>
          <div className="admin-teams">
            {state.teams.map((t) => (
              <section key={t.id} style={{ borderColor: TEAM_COLORS[t.id] }}>
                <h2 style={{ color: TEAM_COLORS[t.id] }}>{teamName(t.id)} ({t.players.length})</h2>
                <ul>
                  {t.players.map((p) => (
                    <li key={p.id} className={p.online ? '' : 'is-offline'}>
                      <span>
                        {p.isDesignatedCaptain && '★ '}
                        {p.name}
                        {p.isCaptain && !p.isDesignatedCaptain && ' (giữ quyền tạm)'}
                      </span>
                      <button
                        disabled={p.isDesignatedCaptain}
                        onClick={() => socket.emit('admin:setCaptain', { playerId: p.id }, () => {})}
                      >
                        Làm đội trưởng
                      </button>
                      <select
                        value={t.id}
                        aria-label={`Chuyển ${p.name} sang nhóm`}
                        onChange={(e) => socket.emit('admin:movePlayer', { playerId: p.id, teamId: Number(e.target.value) }, () => {})}
                      >
                        {TEAM_IDS.map((id) => <option key={id} value={id}>{teamName(id)}</option>)}
                      </select>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </>
      )}
    </main>
  );
}
