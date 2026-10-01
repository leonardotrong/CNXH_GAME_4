import { useEffect, useState, type FormEvent } from 'react';
import { AdminBoard } from '../AdminBoard';
import { AdminFallback } from '../AdminFallback';
import { AdminLog } from '../AdminLog';
import { AdminNext } from '../AdminNext';
import { AdminPlayers } from '../AdminPlayers';
import { ConnectionBadge } from '../ConnectionBadge';
import { Icon } from '../Icon';
import { Logo } from '../Logo';
import { QuestionPanel } from '../QuestionPanel';
import { socket, useAdminLog, useGame, useQuestion, useRoomState } from '../socket';

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
        <ConnectionBadge />
      </header>
      <AdminNext hasRoom={!!state} game={game} question={question} onNotice={setNotice} />
      {notice && (
        <p className="form-error" role="alert">
          {notice}
        </p>
      )}
      {state && (
        <>
          {game?.fallback && (
            <section className="admin-card admin-fallback">
              <h2>Chế độ dự phòng</h2>
              <AdminFallback game={game} question={question} report={report} />
            </section>
          )}
          <div className="admin-grid">
            <AdminBoard game={game} onNotice={setNotice} />
            <div className="admin-col">
              {question && (
                <section className="admin-card admin-trial">
                  <h2>
                    Câu hỏi
                    <button
                      className="mini-btn mini-btn--danger"
                      disabled={!testAllowed && question.status !== 'open'}
                      onClick={() => socket.emit('admin:skipQuestion', (res) => setNotice(res.ok ? '' : `Không bỏ qua được (${res.error}).`))}
                    >
                      {testAllowed ? 'Hủy câu thử' : 'Câu lỗi? Đổi câu khác'}
                    </button>
                  </h2>
                  <div className="admin-question">
                    <QuestionPanel view={question} activeTeamIds={state.teams.filter((t) => t.players.length > 0).map((t) => t.id)} />
                  </div>
                </section>
              )}
              <AdminLog entries={log} />
            </div>
          </div>
          <AdminPlayers state={state} />
          <section className="admin-card admin-tools">
            <h2>Công cụ khác</h2>
            <div className="admin-actions">
              <button
                className="primary-btn primary-btn--ghost"
                disabled={question?.status === 'open' || !testAllowed}
                title="Một câu cho cả lớp làm quen cách bỏ phiếu (chỉ ở phòng chờ / tổng kết)"
                onClick={() => socket.emit('admin:startQuestion', { pool: 'board' }, (res) => setNotice(res.ok ? '' : `Không mở được câu hỏi (${res.error}).`))}
              >
                <Icon name="question" /> Câu thử
              </button>
              <button
                className="primary-btn primary-btn--ghost"
                disabled={question?.status === 'open' || !testAllowed}
                onClick={() => socket.emit('admin:startQuestion', { pool: 'bomb' }, (res) => setNotice(res.ok ? '' : `Không mở được câu hỏi (${res.error}).`))}
              >
                <Icon name="bomb" /> Câu thử (kho bom)
              </button>
              <button className="primary-btn primary-btn--ghost" onClick={() => socket.emit('admin:setLobbyOpen', { open: !state.lobbyOpen }, () => {})}>
                <Icon name="users" /> {state.lobbyOpen ? 'Đóng cổng vào phòng' : 'Mở lại cổng vào phòng'}
              </button>
              {game?.phase === 'SUMMARY' && (
                <button
                  className="primary-btn primary-btn--ghost"
                  onClick={() => socket.emit('admin:startBoard', { totalTurns: game.board?.totalTurns }, report('Không bắt đầu được Bàn Cờ'))}
                >
                  <Icon name="repeat" /> Chơi lại Bàn Cờ
                </button>
              )}
              <label className="switch">
                <input
                  type="checkbox"
                  checked={game?.fallback ?? false}
                  onChange={(e) => socket.emit('admin:setFallback', { on: e.target.checked }, report('Không đổi được chế độ dự phòng'))}
                />
                Chế độ dự phòng (mạng sập: chơi bằng thẻ màu)
              </label>
              <span className="admin-controls__spacer" />
              <button className="primary-btn primary-btn--ghost" onClick={createRoom}>
                Tạo phòng mới
              </button>
            </div>
            <p className="admin-muted admin-tools__tip">
              <Icon name="monitor" /> Mẹo: trên màn chiếu (/host) bấm <kbd>K</kbd> và nhập mật khẩu này để điều khiển bằng phím
              <kbd>Space</kbd> (bước tiếp), <kbd>P</kbd> (tạm dừng) — không cần chuyển cửa sổ.
            </p>
          </section>
        </>
      )}
    </main>
  );
}
