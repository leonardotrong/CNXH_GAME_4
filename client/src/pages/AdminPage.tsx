import { useEffect, useState, type FormEvent } from 'react';
import { TEAM_IDS } from '@cnxh/shared';
import { AdminBoard } from '../AdminBoard';
import { AdminFallback } from '../AdminFallback';
import { AdminLog } from '../AdminLog';
import { PHASE_LABELS } from '../boardText';
import { ConnectionBadge } from '../ConnectionBadge';
import { QuestionPanel } from '../QuestionPanel';
import { socket, useAdminLog, useGame, useQuestion, useRoomState } from '../socket';
import { TEAM_COLORS, teamName } from '../teams';

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
      <button
        className="primary-btn"
        onClick={() => {
          if (state && game && game.phase !== 'LOBBY' && game.phase !== 'SUMMARY' && !window.confirm('Đang có trận. Tạo phòng mới sẽ bỏ trận hiện tại. Tiếp tục?')) return;
          socket.emit('admin:createRoom', () => {});
        }}
      >
        {state ? 'Tạo phòng mới' : 'Tạo phòng'}
      </button>
      {state && (
        <>
          <p className="admin-code">
            Mã phòng: <strong>{state.code}</strong> · Pha: <b>{game ? PHASE_LABELS[game.phase] ?? game.phase : '…'}</b>
          </p>
          <div className={`admin-controls ${paused ? 'is-paused' : ''}`}>
            <button
              className={`primary-btn admin-controls__pause ${paused ? '' : 'primary-btn--danger'}`}
              onClick={() => socket.emit('admin:setPaused', { paused: !paused }, report('Không đổi được tạm dừng'))}
            >
              {paused ? '▶ TIẾP TỤC' : '⏸ TẠM DỪNG'}
            </button>
            <label className="admin-inline">
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
          </div>
          {paused && <p className="admin-paused">Trận đang TẠM DỪNG — đồng hồ, ngòi bom đứng yên; người chơi không bỏ phiếu được.</p>}
          {game?.fallback && (
            <section className="admin-fallback">
              <h2>Chế độ dự phòng</h2>
              <AdminFallback game={game} question={question} report={report} />
            </section>
          )}
          <button
            className="primary-btn"
            onClick={() => socket.emit('admin:setLobbyOpen', { open: !state.lobbyOpen }, () => {})}
          >
            {state.lobbyOpen ? 'Đóng cổng vào phòng' : 'Mở lại cổng vào phòng'}
          </button>
          <AdminBoard game={game} onNotice={setNotice} />
          <div className="admin-actions">
            <button
              className="primary-btn"
              disabled={question?.status === 'open' || !testAllowed}
              onClick={() =>
                socket.emit('admin:startQuestion', { pool: 'board' }, (res) =>
                  setNotice(res.ok ? '' : `Không mở được câu hỏi (${res.error}).`),
                )
              }
            >
              Câu thử
            </button>
            <button
              className="primary-btn"
              disabled={question?.status === 'open' || !testAllowed}
              onClick={() =>
                socket.emit('admin:startQuestion', { pool: 'bomb' }, (res) =>
                  setNotice(res.ok ? '' : `Không mở được câu hỏi (${res.error}).`),
                )
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
          {notice && <p className="form-error">{notice}</p>}
          {question && (
            <div className="admin-question">
              <QuestionPanel view={question} activeTeamIds={state?.teams.filter((t) => t.players.length > 0).map((t) => t.id)} />
            </div>
          )}
          <AdminLog entries={log} />
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
