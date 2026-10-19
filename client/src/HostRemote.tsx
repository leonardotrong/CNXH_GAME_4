import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { GameView, PublicQuestionView } from '@cnxh/shared';
import { Icon } from './Icon';
import { DEFAULT_STEP_OPTIONS, nextStep, practiceStep, type NextStep } from './nextStep';
import { ACK_TIMEOUT_MS, orNetworkError, socket } from './socket';
import { isMuted, setMuted, unlockAudio } from './sound';

/** Dùng chung khóa với /admin: đăng nhập một lần mỗi tab, tải lại trang không phải nhập lại. */
const PW_KEY = 'cnxh.adminPassword';
const HINT_MS = 5000;

/**
 * Người dẫn điều khiển ngay trên máy chiếu (GAME_SPEC 5.3):
 * K = đăng nhập · Space/→ = bước tiếp theo · T = chơi thử 2 lượt (màn luật) · P = tạm dừng · M = âm thanh · F = toàn màn hình.
 * Không đăng nhập thì màn chiếu vẫn chỉ để xem như cũ.
 */
export function HostRemote({ hasRoom, game, question }: { hasRoom: boolean; game: GameView | null; question: PublicQuestionView | null }) {
  const [authed, setAuthed] = useState(false);
  const [asking, setAsking] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [toast, setToast] = useState<{ text: string; bad?: boolean; id: number } | null>(null);
  const [hintVisible, setHintVisible] = useState(false);
  const hintTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  /** Đang chờ server trả lời một lệnh: bấm thêm thì bỏ qua (phím nảy/bấm đúp không nhảy hai bước). */
  const sending = useRef(false);

  // Giá trị mới nhất cho trình nghe phím (đăng ký một lần).
  const latest = useRef({ hasRoom, game, question, authed });
  latest.current = { hasRoom, game, question, authed };

  const showToast = (text: string, bad = false) => setToast({ text, bad, id: Date.now() });
  const showHint = () => {
    setHintVisible(true);
    clearTimeout(hintTimer.current);
    hintTimer.current = setTimeout(() => setHintVisible(false), HINT_MS);
  };

  const login = (pw: string, silent = false) =>
    socket.emit('admin:login', { password: pw }, (res) => {
      if (res.ok) {
        setAuthed(true);
        setAsking(false);
        setError('');
        try { sessionStorage.setItem(PW_KEY, pw); } catch { /* bỏ qua */ }
        if (!silent) showToast('Đã bật điều khiển bằng phím');
        showHint();
      } else if (!silent) {
        setError('Sai mật khẩu.');
      }
    });

  // Tự đăng nhập lại khi (tái) kết nối nếu tab này đã đăng nhập.
  useEffect(() => {
    const auto = () => {
      let pw: string | null = null;
      try { pw = sessionStorage.getItem(PW_KEY); } catch { /* bỏ qua */ }
      if (pw) login(pw, true);
    };
    socket.on('connect', auto);
    if (socket.connected) auto();
    return () => {
      socket.off('connect', auto);
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest('input, textarea, select')) return;
      // Nút vừa được bấm chuột (vd. âm thanh) vẫn giữ focus: bỏ focus để Space không bấm lại nút đó.
      if (target?.closest('button')) target.blur();
      unlockAudio();
      const { hasRoom, game, question, authed } = latest.current;
      const key = e.key.toLowerCase();
      // Giữ phím thì trình duyệt lặp keydown: không lặp lệnh (giữ Space lâu sẽ nhảy qua nhiều bước, vd. bỏ qua màn luật).
      if (e.repeat) {
        if (key === ' ') e.preventDefault();
        return;
      }
      if (key === 'f') {
        e.preventDefault();
        if (document.fullscreenElement) void document.exitFullscreen();
        else void document.documentElement.requestFullscreen?.().catch(() => {});
        return;
      }
      if (key === 'm') {
        setMuted(!isMuted());
        showToast(isMuted() ? 'Đã tắt âm thanh' : 'Đã bật âm thanh');
        return;
      }
      if (key === 'k' || key === '?') {
        e.preventDefault();
        if (authed) showHint();
        else setAsking(true);
        return;
      }
      if (!authed) return;
      /** Gửi được lệnh chưa: lệnh trước còn chờ kết quả (phím nảy, bấm đúp) hoặc đang mất kết nối thì thôi. */
      const ready = () => {
        if (sending.current) return false;
        if (socket.connected) return true;
        showToast('Mất kết nối — chờ kết nối lại rồi bấm', true);
        return false;
      };
      const failed = (what: string, error?: string) =>
        error === 'NETWORK' ? 'Mạng chập chờn — xem màn hình, chưa đổi thì bấm lại' : `Không được: ${what} (${error})`;
      const run = (step: NextStep) => {
        sending.current = true;
        step.run!(DEFAULT_STEP_OPTIONS, (res) => {
          sending.current = false;
          showToast(res.ok ? step.label : failed(step.label, res.error), !res.ok);
        });
        showHint();
      };
      if (key === 't') {
        const practice = practiceStep(game, question);
        if (!practice) return;
        e.preventDefault();
        if (ready()) run(practice);
        return;
      }
      if (key === ' ' || key === 'arrowright' || key === 'enter') {
        e.preventDefault();
        const step = nextStep(hasRoom, game, question);
        if (!step.run) {
          showToast(step.label);
          return;
        }
        if (!ready()) return;
        // Tạo phòng mới khi đang có trận chỉ làm ở /admin (tránh bấm nhầm).
        run(step);
        return;
      }
      if (key === 'p') {
        e.preventDefault();
        if (!game || game.phase === 'LOBBY' || game.phase === 'RULES' || game.phase === 'SUMMARY') return;
        if (!ready()) return;
        const paused = game.pausedAt === null;
        sending.current = true;
        socket.timeout(ACK_TIMEOUT_MS).emit(
          'admin:setPaused',
          { paused },
          orNetworkError((res) => {
            sending.current = false;
            showToast(res.ok ? (paused ? 'Đã tạm dừng' : 'Tiếp tục') : failed('tạm dừng', res.error), !res.ok);
          }),
        );
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    login(password);
  };

  const step = nextStep(hasRoom, game, question);
  const practice = practiceStep(game, question);

  return (
    <>
      {!authed && (
        <button className="remote-open" onClick={() => setAsking(true)} title="Điều khiển bằng bàn phím (phím K)">
          <Icon name="sliders" />
        </button>
      )}
      {authed && (
        <div className={`remote-hint ${hintVisible ? 'is-visible' : ''}`} aria-hidden={!hintVisible}>
          <span>
            <kbd>Space</kbd> {step.run ? step.label : step.label + ' (tự chạy)'}
          </span>
          {practice && (
            <span>
              <kbd>T</kbd> {practice.label}
            </span>
          )}
          {game && game.phase !== 'LOBBY' && game.phase !== 'RULES' && game.phase !== 'SUMMARY' && (
            <span>
              <kbd>P</kbd> {game.pausedAt === null ? 'Tạm dừng' : 'Tiếp tục'}
            </span>
          )}
          <span>
            <kbd>M</kbd> Âm thanh
          </span>
          <span>
            <kbd>F</kbd> Toàn màn hình
          </span>
        </div>
      )}
      {toast && (
        <div key={toast.id} className={`remote-toast ${toast.bad ? 'is-bad' : ''}`} role="status">
          {!toast.bad && <Icon name="check" />}
          {toast.text}
        </div>
      )}
      {asking && (
        <div className="remote-dialog" role="dialog" aria-modal="true" onKeyDown={(e) => e.key === 'Escape' && setAsking(false)}>
          <form className="remote-dialog__card" onSubmit={submit}>
            <h2>Điều khiển bằng bàn phím</h2>
            <p>Nhập mật khẩu người dẫn. Sau đó bấm <kbd>Space</kbd> để sang bước tiếp theo — không cần mở /admin.</p>
            <input
              type="password"
              autoFocus
              autoComplete="current-password"
              placeholder="Mật khẩu"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {error && <p className="form-error">{error}</p>}
            <div className="remote-dialog__actions">
              <button type="button" className="primary-btn primary-btn--ghost" onClick={() => setAsking(false)}>
                Hủy
              </button>
              <button type="submit" className="primary-btn">
                Bật điều khiển
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
