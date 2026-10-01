import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { MAX_NAME_LENGTH, TEAM_IDS, isRoomCode } from '@cnxh/shared';
import { ConnectionBadge } from '../ConnectionBadge';
import { Icon } from '../Icon';
import { Logo } from '../Logo';
import { PlayBoard } from '../PlayBoard';
import { PlayQuestion } from '../PlayQuestion';
import { BOARD_RULES } from '../rules';
import { StatusBanner } from '../StatusBanner';
import { socket, useGame, useQuestion, useRoomState, useTeamPass, useTeamSelect, useTeamVotes } from '../socket';
import { teamName, teamStyle } from '../teams';

const STORAGE_KEY = 'cnxh.player';
/** Tên đã nhập lần trước — điền sẵn khi vào phòng mới (buổi sau, hoặc khi phòng bị tạo lại). */
const NAME_KEY = 'cnxh.name';

function loadName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? '';
  } catch {
    return '';
  }
}

interface Saved {
  roomCode: string;
  playerId: string;
}

function loadSaved(): Saved | null {
  try {
    const v = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    return v && typeof v.roomCode === 'string' && typeof v.playerId === 'string' ? v : null;
  } catch {
    return null;
  }
}

const ERRORS: Record<string, string> = {
  ROOM_NOT_FOUND: 'Không tìm thấy phòng. Kiểm tra lại mã phòng.',
  LOBBY_CLOSED: 'Phòng đã đóng cổng vào. Nhờ người dẫn mở lại cổng vào phòng rồi thử lại.',
  BAD_REQUEST: 'Thông tin chưa hợp lệ.',
};

export function PlayPage() {
  const state = useRoomState();
  const question = useQuestion();
  const teamVotes = useTeamVotes();
  const game = useGame();
  const teamSelect = useTeamSelect();
  const teamPass = useTeamPass();
  const roomFromUrl = new URLSearchParams(window.location.search).get('room') ?? '';
  const [saved, setSaved] = useState<Saved | null>(() => {
    const s = loadSaved();
    return s && (!roomFromUrl || s.roomCode === roomFromUrl) ? s : null;
  });
  const [roomCode, setRoomCode] = useState(roomFromUrl);
  // Mã phòng có sẵn từ QR → chỉ hiện dạng nhãn, khỏi phải nhìn/nhập.
  const [editRoom, setEditRoom] = useState(!isRoomCode(roomFromUrl));
  const [name, setName] = useState(loadName);
  const [teamId, setTeamId] = useState<number | null>(null);
  const [error, setError] = useState('');

  const remember = useCallback((s: Saved | null) => {
    setSaved(s);
    try {
      if (s) localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
      else localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* localStorage bị chặn: vẫn chơi được, chỉ không giữ được khi tải lại */
    }
  }, []);

  // Vào lại phòng (kể cả sau khi mất kết nối hoặc tải lại trang).
  useEffect(() => {
    if (!saved) return;
    const rejoin = () =>
      socket.emit('player:join', { roomCode: saved.roomCode, playerId: saved.playerId }, (res) => {
        if (!res.ok) {
          remember(null);
          setError(ERRORS[res.error] ?? 'Không vào lại được phòng.');
        }
      });
    socket.on('connect', rejoin);
    if (socket.connected) rejoin();
    return () => {
      socket.off('connect', rejoin);
    };
  }, [saved, remember]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (!isRoomCode(roomCode) || !name.trim() || teamId === null) {
      setError('Nhập mã phòng 4 chữ số, tên và chọn nhóm.');
      return;
    }
    socket.emit('player:join', { roomCode, name, teamId }, (res) => {
      if (res.ok) {
        remember({ roomCode, playerId: res.playerId });
        try { localStorage.setItem(NAME_KEY, name.trim()); } catch { /* bỏ qua */ }
      }
      else setError(ERRORS[res.error] ?? 'Không vào được phòng.');
    });
  };

  const me = saved && state ? state.teams.flatMap((t) => t.players.map((p) => ({ ...p, teamId: t.id }))).find((p) => p.id === saved.playerId) : undefined;

  if (saved && me && state) {
    const inGame = !!game?.board && game.phase !== 'LOBBY' && !(game.phase === 'SUMMARY' && question);
    const members = state.teams[me.teamId - 1]!.players;
    const inLobby = state.lobbyOpen && !question && (game?.phase ?? 'LOBBY') === 'LOBBY';
    // Đang có vòng bỏ phiếu/câu hỏi: thu gọn danh sách nhóm để màn hình chỉ còn việc cần làm.
    const busy = inGame || !!question;
    const online = members.filter((p) => p.online).length;
    return (
      <main className={`page page--play ${inGame && game!.phase.startsWith('BOMB_') ? 'page--danger' : ''}`} style={teamStyle(me.teamId)}>
        <header className="play-head">
          <span className="play-head__who">
            <span className="play-head__team">{teamName(me.teamId)}</span>
            <span className="play-head__name">
              {me.name}
              {me.isCaptain && ' · ★ Đội trưởng'}
            </span>
          </span>
          <ConnectionBadge />
        </header>
        <StatusBanner game={game} audience="play" />
        {inGame ? (
          <PlayBoard
            key={game!.phase}
            game={game!}
            question={question}
            teamVotes={teamVotes}
            teamSelect={teamSelect}
            teamPass={teamPass}
            playerId={me.id}
            teamId={me.teamId}
          />
        ) : question && question.teamIds.includes(me.teamId) ? (
          <PlayQuestion view={question} team={teamVotes} playerId={me.id} />
        ) : game?.phase === 'RULES' ? (
          <section className="play-rules">
            <h2 className="play-section-title">Luật chơi</h2>
            <ul>
              {BOARD_RULES.map((r) => (
                <li key={r.title}>
                  <Icon name={r.icon} className="play-rules__icon" />
                  <span>
                    <b>{r.title}.</b> {r.text}
                  </span>
                </li>
              ))}
            </ul>
            {me.isCaptain && <p className="play-rules__captain">★ Bạn là đội trưởng: bạn có nút CHỐT.</p>}
          </section>
        ) : (
          <section className="wait-card">
            <p className="wait-card__title">
              Chờ người dẫn bắt đầu
              <span className="dots" aria-hidden>
                <i />
                <i />
                <i />
              </span>
            </p>
            <p className="wait-card__room">
              Phòng <b>{state.code}</b> · {members.length} người trong nhóm
            </p>
          </section>
        )}
        {inLobby && (
          <section className="play-switch">
            <h2 className="play-section-title">Đổi nhóm</h2>
            <div className="team-grid">
              {TEAM_IDS.map((id) => (
                <button
                  key={id}
                  className={`team-btn ${id === me.teamId ? 'is-selected' : 'is-dim'}`}
                  style={teamStyle(id)}
                  aria-pressed={id === me.teamId}
                  onClick={() => socket.emit('player:changeTeam', { teamId: id }, () => {})}
                >
                  {teamName(id)}
                </button>
              ))}
            </div>
          </section>
        )}
        {busy ? (
          <details className="play-team play-team--compact">
            <summary>
              Nhóm của bạn: <b>{members.length}</b> người · {online} online
            </summary>
            <MemberList members={members} meId={me.id} />
          </details>
        ) : (
          <section className="play-team">
            <h2 className="play-section-title">
              Nhóm của bạn <span>({members.length})</span>
            </h2>
            <MemberList members={members} meId={me.id} />
          </section>
        )}
      </main>
    );
  }

  if (saved) {
    return (
      <main className="page page--play page--center">
        <ConnectionBadge />
        <section className="wait-card">
          <p className="wait-card__title">
            Đang vào lại phòng
            <span className="dots" aria-hidden>
              <i />
              <i />
              <i />
            </span>
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className="page page--play page--join">
      <ConnectionBadge />
      <header className="join-brand">
        <Logo />
        <div>
          <h1>Bàn Cờ Quyền Lực</h1>
          <p>&amp; Quả Bom Tham Nhũng</p>
        </div>
      </header>
      <form className="join-form" onSubmit={submit}>
        {editRoom ? (
          <label className="field">
            Mã phòng
            <input inputMode="numeric" maxLength={4} placeholder="4 chữ số trên màn chiếu" value={roomCode} onChange={(e) => setRoomCode(e.target.value.replace(/\D/g, ''))} />
          </label>
        ) : (
          <p className="join-room">
            Phòng <b>{roomCode}</b>
            <button type="button" className="link-btn" onClick={() => setEditRoom(true)}>
              Đổi
            </button>
          </p>
        )}
        <label className="field">
          Tên của bạn
          <input maxLength={MAX_NAME_LENGTH} placeholder="Họ và tên" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <fieldset className="join-teams">
          <legend>Chọn nhóm</legend>
          <div className="team-grid">
            {TEAM_IDS.map((id) => (
              <button
                type="button"
                key={id}
                className={`team-btn ${id === teamId ? 'is-selected' : ''}`}
                style={teamStyle(id)}
                aria-pressed={id === teamId}
                onClick={() => setTeamId(id)}
              >
                {teamName(id)}
              </button>
            ))}
          </div>
        </fieldset>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="primary-btn primary-btn--green join-form__submit">
          Vào chơi
        </button>
      </form>
    </main>
  );
}

/** Danh sách thành viên nhóm mình (★ = đội trưởng, mờ = mất kết nối). */
function MemberList({ members, meId }: { members: { id: string; name: string; online: boolean; isCaptain: boolean }[]; meId: string }) {
  return (
    <ul className="play-members">
      {members.map((p) => (
        <li key={p.id} className={[p.online ? '' : 'is-offline', p.id === meId ? 'is-me' : ''].join(' ')}>
          {p.isCaptain && '★ '}
          {p.name}
        </li>
      ))}
    </ul>
  );
}
