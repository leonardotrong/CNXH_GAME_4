import { useEffect, useState, type FormEvent } from 'react';
import { TEAM_IDS } from '@cnxh/shared';
import { AdminBoard } from '../AdminBoard';
import { AdminFallback } from '../AdminFallback';
import { AdminLog } from '../AdminLog';
import { PHASE_LABELS } from '../boardText';
import { ConnectionBadge } from '../ConnectionBadge';
import { Icon } from '../Icon';
import { Logo } from '../Logo';
import { QuestionPanel } from '../QuestionPanel';
import { socket, useAdminLog, useGame, useQuestion, useRoomState } from '../socket';
import { teamName, teamStyle } from '../teams';

const PW_KEY = 'cnxh.adminPassword';

export function AdminPage() {
  const state = useRoomState();
  const question = useQuestion();
  const game = useGame();
  const log = useAdminLog();
  const [notice, setNotice] = useState('');
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

  /** Câu thử chỉ mở được ngoài trận (LOBBY/SUMMARY). */
  const testAllowed = !game || game.phase === 'LOBBY' || game.phase === 'SUMMARY';
  const report = (what: string) => (res: { ok: boolean; error?: string }) => setNotice(res.ok ? '' : `${what} (${res.error}).`);
  const paused = game?.pausedAt != null;

  const createRoom = () => {
    if (state && game && game.phase !== 'LOBBY' && game.phase !== 'SUMMARY' && !window.confirm('Đang có trận. Tạo phòng mới sẽ bỏ trận hiện tại. Tiếp tục?')) return;
    socket.emit('admin:createRoom', () => {});
  };

  if (!authed) {
    return (
      <main className="page page--admin page--admin-login">
        <form className="admin-login" onSubmit={submit}>
          <Logo className="admin-login__logo" />
          <h1>Bảng điều khiển người dẫn</h1>
          <p className="admin-login__sub">Bàn Cờ Quyền Lực &amp; Quả Bom Tham Nhũng</p>
          <label className="field">
            Mật khẩu
            <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button type="submit" className="primary-btn">
            Đăng nhập
          </button>
          <ConnectionBadge />
        </form>
      </main>
    );
  }

  const players = state?.teams.reduce((n, t) => n + t.players.length, 0) ?? 0;

  return (
    <main className="page page--admin">
      <header className="admin-top">
        <Logo className="admin-top__logo" />
        <div className="admin-top__title">
          <h1>Bảng điều khiển người dẫn</h1>
          <span>Bàn Cờ Quyền Lực &amp; Quả Bom Tham Nhũng</span>
        </div>
        {state && (
          <span className="admin-top__room">
            Mã phòng <b>{state.code}</b>
          </span>
        )}
        {state && <span className="admin-top__phase">{game ? PHASE_LABELS[game.phase] ?? game.phase : '…'}</span>}
        <ConnectionBadge />
      </header>
      {!state ? (
        <section className="admin-card admin-empty">
          <p>Chưa có phòng. Tạo phòng để màn chiếu hiện mã QR cho sinh viên quét.</p>
          <button className="primary-btn primary-btn--gold" onClick={createRoom}>
            Tạo phòng
          </button>
        </section>
      ) : (
        <>
          <div className={`admin-controls ${paused ? 'is-paused' : ''}`}>
            <button
              className={`primary-btn admin-controls__pause ${paused ? 'primary-btn--gold' : 'primary-btn--danger'}`}
              onClick={() => socket.emit('admin:setPaused', { paused: !paused }, report('Không đổi được tạm dừng'))}
            >
              <Icon name={paused ? 'play' : 'pause'} />
              {paused ? 'TIẾP TỤC' : 'TẠM DỪNG'}
            </button>
            <label className="switch">
              <input
                type="checkbox"
                checked={game?.fallback ?? false}
                onChange={(e) => socket.emit('admin:setFallback', { on: e.target.checked }, report('Không đổi được chế độ dự phòng'))}
              />
              Chế độ dự phòng (thẻ màu)
            </label>
            {game?.phase === 'SUMMARY' && (
              <button
                className="primary-btn"
                onClick={() =>
                  socket.emit('admin:setSummaryView', { view: game.summaryView === 'ranking' ? 'lessons' : 'ranking' }, report('Không đổi được màn tổng kết'))
                }
              >
                {game.summaryView === 'ranking' ? 'Hiện 6 đặc điểm (tổng kết)' : 'Hiện bảng xếp hạng'}
              </button>
            )}
            <span className="admin-controls__spacer" />
            <button className="primary-btn primary-btn--ghost" onClick={() => socket.emit('admin:setLobbyOpen', { open: !state.lobbyOpen }, () => {})}>
              {state.lobbyOpen ? 'Đóng cổng vào phòng' : 'Mở lại cổng vào phòng'}
            </button>
            <button className="primary-btn primary-btn--ghost" onClick={createRoom}>
              Tạo phòng mới
            </button>
          </div>
          {paused && <p className="admin-paused">Trận đang TẠM DỪNG — đồng hồ, ngòi bom đứng yên; người chơi không bỏ phiếu được.</p>}
          {notice && (
            <p className="form-error" role="alert">
              {notice}
            </p>
          )}
          {game?.fallback && (
            <section className="admin-card admin-fallback">
              <h2>Chế độ dự phòng</h2>
              <AdminFallback game={game} question={question} report={report} />
            </section>
          )}
          <div className="admin-grid">
            <AdminBoard game={game} onNotice={setNotice} />
            <div className="admin-col">
              <section className="admin-card admin-trial">
                <h2>Câu hỏi</h2>
                <div className="admin-actions">
                  <button
                    className="primary-btn"
                    disabled={question?.status === 'open' || !testAllowed}
                    onClick={() =>
                      socket.emit('admin:startQuestion', { pool: 'board' }, (res) => setNotice(res.ok ? '' : `Không mở được câu hỏi (${res.error}).`))
                    }
                  >
                    Câu thử
                  </button>
                  <button
                    className="primary-btn"
                    disabled={question?.status === 'open' || !testAllowed}
                    onClick={() =>
                      socket.emit('admin:startQuestion', { pool: 'bomb' }, (res) => setNotice(res.ok ? '' : `Không mở được câu hỏi (${res.error}).`))
                    }
                  >
                    Câu thử (kho bom)
                  </button>
                  <button
                    className="primary-btn primary-btn--danger"
                    disabled={!question || (!testAllowed && question.status !== 'open')}
                    onClick={() => socket.emit('admin:skipQuestion', (res) => setNotice(res.ok ? '' : `Không bỏ qua được (${res.error}).`))}
                  >
                    {testAllowed ? 'Bỏ qua câu' : 'Bỏ qua câu lỗi (đổi câu khác)'}
                  </button>
                </div>
                {question ? (
                  <div className="admin-question">
                    <QuestionPanel view={question} activeTeamIds={state.teams.filter((t) => t.players.length > 0).map((t) => t.id)} />
                  </div>
                ) : (
                  <p className="admin-muted">Không có câu hỏi đang mở.</p>
                )}
              </section>
              <AdminLog entries={log} />
            </div>
          </div>
          <section className="admin-card">
            <h2>
              Người chơi <span className="admin-count">{players}</span>
            </h2>
            <div className="admin-teams">
              {state.teams.map((t) => (
                <section key={t.id} className="admin-team" style={teamStyle(t.id)}>
                  <h3>
                    {teamName(t.id)} <span>{t.players.length}</span>
                  </h3>
                  {t.players.length === 0 && <p className="admin-muted">Chưa có ai.</p>}
                  <ul>
                    {t.players.map((p) => (
                      <li key={p.id} className={p.online ? '' : 'is-offline'}>
                        <span className="admin-team__name">
                          {p.isDesignatedCaptain && <span className="captain-star">★</span>}
                          {p.name}
                          {p.isCaptain && !p.isDesignatedCaptain && <em> (giữ quyền tạm)</em>}
                        </span>
                        <button
                          className="mini-btn"
                          disabled={p.isDesignatedCaptain}
                          onClick={() => socket.emit('admin:setCaptain', { playerId: p.id }, () => {})}
                        >
                          Làm đội trưởng
                        </button>
                        <select
                          className="mini-select"
                          value={t.id}
                          aria-label={`Chuyển ${p.name} sang nhóm`}
                          onChange={(e) => socket.emit('admin:movePlayer', { playerId: p.id, teamId: Number(e.target.value) }, () => {})}
                        >
                          {TEAM_IDS.map((id) => (
                            <option key={id} value={id}>
                              {teamName(id)}
                            </option>
                          ))}
                        </select>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          </section>
        </>
      )}
    </main>
  );
}
