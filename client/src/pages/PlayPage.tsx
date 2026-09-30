import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { MAX_NAME_LENGTH, TEAM_IDS, isRoomCode } from '@cnxh/shared';
import { ConnectionBadge } from '../ConnectionBadge';
import { PlayQuestion } from '../PlayQuestion';
import { socket, useQuestion, useRoomState, useTeamVotes } from '../socket';
import { TEAM_COLORS, teamName } from '../teams';

const STORAGE_KEY = 'cnxh.player';

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
  LOBBY_CLOSED: 'Phòng đã đóng cổng vào. Nhờ người dẫn chuyển bạn vào nhóm.',
  BAD_REQUEST: 'Thông tin chưa hợp lệ.',
};

export function PlayPage() {
  const state = useRoomState();
  const question = useQuestion();
  const teamVotes = useTeamVotes();
  const roomFromUrl = new URLSearchParams(window.location.search).get('room') ?? '';
  const [saved, setSaved] = useState<Saved | null>(() => {
    const s = loadSaved();
    return s && (!roomFromUrl || s.roomCode === roomFromUrl) ? s : null;
  });
  const [roomCode, setRoomCode] = useState(roomFromUrl);
  const [name, setName] = useState('');
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
      if (res.ok) remember({ roomCode, playerId: res.playerId });
      else setError(ERRORS[res.error] ?? 'Không vào được phòng.');
    });
  };

  const me = saved && state ? state.teams.flatMap((t) => t.players.map((p) => ({ ...p, teamId: t.id }))).find((p) => p.id === saved.playerId) : undefined;

  if (saved && me && state) {
    return (
      <main className="page page--play">
        <ConnectionBadge />
        <h1 style={{ color: TEAM_COLORS[me.teamId] }}>{teamName(me.teamId)}</h1>
        <p className="play-name">{me.name}{me.isCaptain && ' ★ Đội trưởng'}</p>
        {question && question.teamIds.includes(me.teamId) ? (
          <PlayQuestion view={question} team={teamVotes} playerId={me.id} />
        ) : (
          <p>Phòng {state.code} — chờ người dẫn bắt đầu…</p>
        )}
        {state.lobbyOpen && !question && (
          <div className="team-grid">
            {TEAM_IDS.map((id) => (
              <button
                key={id}
                className="team-btn"
                style={{ background: TEAM_COLORS[id], opacity: id === me.teamId ? 1 : 0.55 }}
                onClick={() => socket.emit('player:changeTeam', { teamId: id }, () => {})}
              >
                {teamName(id)}
              </button>
            ))}
          </div>
        )}
        <h2>Nhóm của bạn</h2>
        <ul className="play-members">
          {state.teams[me.teamId - 1]!.players.map((p) => (
            <li key={p.id} className={p.online ? '' : 'is-offline'}>{p.isCaptain && '★ '}{p.name}</li>
          ))}
        </ul>
      </main>
    );
  }

  if (saved) {
    return (
      <main className="page page--play">
        <ConnectionBadge />
        <p>Đang vào lại phòng…</p>
      </main>
    );
  }

  return (
    <main className="page page--play">
      <h1>Vào phòng</h1>
      <ConnectionBadge />
      <form className="join-form" onSubmit={submit}>
        <label>
          Mã phòng
          <input inputMode="numeric" maxLength={4} value={roomCode} onChange={(e) => setRoomCode(e.target.value.replace(/\D/g, ''))} />
        </label>
        <label>
          Tên của bạn
          <input maxLength={MAX_NAME_LENGTH} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <div className="team-grid">
          {TEAM_IDS.map((id) => (
            <button
              type="button"
              key={id}
              className="team-btn"
              style={{ background: TEAM_COLORS[id], outline: id === teamId ? '4px solid #1a1a1a' : 'none' }}
              onClick={() => setTeamId(id)}
            >
              {teamName(id)}
            </button>
          ))}
        </div>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button type="submit" className="primary-btn">Vào chơi</button>
      </form>
    </main>
  );
}
