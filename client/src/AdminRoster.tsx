import { useEffect, useState, type ClipboardEvent, type ReactNode } from 'react';
import {
  TEAM_IDS,
  isTeamId,
  parseRosterText,
  rosterChanges,
  type CaptainRoster,
  type NamedCaptainInfo,
  type PublicTeam,
  type RosterTeamStatus,
} from '@cnxh/shared';
import { Icon } from './Icon';
import { ACK_TIMEOUT_MS, orNetworkError, socket } from './socket';
import { teamName, teamStyle } from './teams';

/**
 * Đội trưởng trên /admin (GAME_SPEC 2.1):
 * - cách chính: nhóm trưởng đặt tên là số nhóm → server tự đặt; ở đây chỉ hiện tình trạng và nút sửa khi vào nhầm nhóm;
 * - dự phòng: danh sách nhóm trưởng thực tế — người dẫn nhập một lần, lưu trên trình duyệt này
 *   (không gửi lên server), rồi đặt đội trưởng theo danh sách bằng một lần bấm.
 */
const ROSTER_KEY = 'cnxh.captainRoster';

type Notice = (msg: string) => void;

function loadRoster(): CaptainRoster {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(ROSTER_KEY) ?? '{}');
    if (typeof saved !== 'object' || saved === null) return {};
    const roster: CaptainRoster = {};
    for (const id of TEAM_IDS) {
      const name = (saved as Record<string, unknown>)[id];
      if (typeof name === 'string') roster[id] = name;
    }
    return roster;
  } catch {
    return {};
  }
}

export function useCaptainRoster(): [CaptainRoster, (next: CaptainRoster) => void] {
  const [roster, setRoster] = useState(loadRoster);
  // Sửa ở tab khác (vd. /admin mở ở hai nơi) → cập nhật theo.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === ROSTER_KEY) setRoster(loadRoster());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);
  const save = (next: CaptainRoster) => {
    setRoster(next);
    try {
      localStorage.setItem(ROSTER_KEY, JSON.stringify(next));
    } catch {
      /* localStorage bị chặn: vẫn dùng được tới khi tải lại trang */
    }
  };
  return [roster, save];
}

/** Lệnh admin đặt đội trưởng; lỗi (kể cả rớt mạng) báo qua `onNotice`. */
export function setCaptain(playerId: string, onNotice: Notice): void {
  socket.timeout(ACK_TIMEOUT_MS).emit(
    'admin:setCaptain',
    { playerId },
    orNetworkError((res) => {
      if (!res.ok) onNotice(`Không đặt được đội trưởng (${res.error}).`);
    }),
  );
}

/** "Đặt theo danh sách": đặt đội trưởng cho mọi nhóm đang lệch danh sách. */
export function applyRoster(statuses: readonly RosterTeamStatus[], onNotice: Notice): void {
  for (const { playerId } of rosterChanges(statuses)) setCaptain(playerId, onNotice);
}

/** Người tên là số nhóm vào nhầm nhóm: chuyển về đúng nhóm — vào đúng nhóm là server tự đặt làm đội trưởng. */
export function moveNamedCaptain(playerId: string, teamId: number, onNotice: Notice): void {
  socket.timeout(ACK_TIMEOUT_MS).emit(
    'admin:movePlayer',
    { playerId, teamId },
    orNetworkError((res) => {
      if (!res.ok) onNotice(`Không chuyển được người chơi (${res.error}).`);
    }),
  );
}

/**
 * Dòng tình trạng "nhóm trưởng đặt tên là số nhóm" của một nhóm; null = không ai đặt tên là số của nhóm này
 * (khi đó hiện dòng so với danh sách, nếu có).
 */
export function namedCaptainLine(info: NamedCaptainInfo, team: PublicTeam, nameOf: (playerId: string) => string, onNotice: Notice): ReactNode {
  const designated = team.players.find((p) => p.isDesignatedCaptain);
  const first = info.inTeam[0];
  if (first !== undefined) {
    if (designated && info.inTeam.includes(designated.id)) {
      const extra = info.inTeam.length - 1;
      return (
        <p className={`roster-line ${extra > 0 ? 'is-warn' : 'is-ok'}`}>
          <Icon name="check" /> Nhóm trưởng tự nhận: “{designated.name}”
          {extra > 0 && ` — còn ${extra} người nữa đặt tên là số nhóm, kiểm tra ô ★`}
        </p>
      );
    }
    return (
      <p className="roster-line is-pending">
        <span>Có “{nameOf(first)}” (tên là số nhóm) — đội trưởng đang do người dẫn chọn</span>
        <button className="mini-btn" onClick={() => setCaptain(first, onNotice)}>
          ★ Đặt
        </button>
      </p>
    );
  }
  const stray = info.elsewhere[0];
  if (!stray) return null;
  return (
    <p className="roster-line is-warn">
      <span>
        “{nameOf(stray.playerId)}” vào nhầm, đang ở <b>{teamName(stray.teamId)}</b>
      </span>
      <button className="mini-btn" onClick={() => moveNamedCaptain(stray.playerId, info.teamId, onNotice)}>
        Chuyển về &amp; đặt ★
      </button>
    </p>
  );
}

/** Nhóm trưởng vào nhầm nhóm: chuyển về nhóm của mình rồi đặt làm đội trưởng. */
function moveAndSetCaptain(playerId: string, teamId: number, onNotice: Notice): void {
  socket.timeout(ACK_TIMEOUT_MS).emit(
    'admin:movePlayer',
    { playerId, teamId },
    orNetworkError((res) => {
      if (res.ok) setCaptain(playerId, onNotice);
      else onNotice(`Không chuyển được người chơi (${res.error}).`);
    }),
  );
}

/** Ô nhập họ tên nhóm trưởng của 7 nhóm; dán nhiều dòng là tự điền lần lượt. */
export function RosterEditor({ roster, onChange }: { roster: CaptainRoster; onChange: (next: CaptainRoster) => void }) {
  const paste = (teamId: number) => (e: ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData('text');
    if (!/[\r\n]/.test(text.trim())) return; // một dòng: dán bình thường
    // Nhiều dòng (kể cả "tiêu đề + một tên"): ô một dòng sẽ dính các dòng vào nhau, nên tự tách.
    e.preventDefault();
    const lines = parseRosterText(text);
    const next = { ...roster };
    // Dòng có ghi số nhóm → đúng nhóm đó; còn lại điền tiếp từ ô đang dán.
    let at = teamId;
    for (const line of lines) {
      const id = line.teamId ?? at;
      if (isTeamId(id)) next[id] = line.name;
      at = id + 1;
    }
    onChange(next);
  };
  return (
    <div className="roster-editor">
      <div className="roster-editor__grid">
        {TEAM_IDS.map((id) => (
          <label key={id} className="roster-field" style={teamStyle(id)}>
            <span>{teamName(id)}</span>
            <input
              value={roster[id] ?? ''}
              placeholder="Họ tên nhóm trưởng"
              autoComplete="off"
              spellCheck={false}
              onChange={(e) => onChange({ ...roster, [id]: e.target.value })}
              onPaste={paste(id)}
            />
          </label>
        ))}
      </div>
      <p className="admin-muted roster-editor__note">
        Dự phòng cho nhóm trưởng quên đặt tên là số nhóm; nhóm đã có người tên là số nhóm thì bỏ qua danh sách. Dán cả danh sách (mỗi dòng
        một nhóm, từ Excel hay ghi chú) vào ô {teamName(1)} là tự điền hết. Danh sách chỉ lưu trên trình duyệt này, không gửi lên server.
        Sinh viên gõ tắt (vd. "An" cho "Nguyễn Văn An") vẫn khớp nếu trong nhóm chỉ có một người như vậy.
      </p>
    </div>
  );
}

/** Dòng tình trạng của một nhóm so với danh sách, trong thẻ nhóm ở mục Người chơi. */
export function RosterStatusLine({
  status,
  nameOf,
  onNotice,
}: {
  status: RosterTeamStatus;
  nameOf: (playerId: string) => string;
  onNotice: Notice;
}) {
  const { match, rosterName } = status;
  switch (match.kind) {
    case 'match':
      return status.applied ? (
        <p className="roster-line is-ok">
          <Icon name="check" /> Đúng danh sách: {rosterName}
        </p>
      ) : (
        <p className="roster-line is-pending">
          <span>
            Danh sách: {rosterName} → <b>{nameOf(match.playerId)}</b>
          </span>
          <button className="mini-btn" onClick={() => setCaptain(match.playerId, onNotice)}>
            ★ Đặt
          </button>
        </p>
      );
    case 'ambiguous':
      return (
        <p className="roster-line is-warn">
          Danh sách: {rosterName} — {match.playerIds.length} người trùng tên, chọn ở ô ★
        </p>
      );
    case 'elsewhere':
      return (
        <p className="roster-line is-warn">
          {/* Chỉ báo khi gõ đủ họ tên → tên người chơi trùng tên trong danh sách, khỏi nhắc lại. */}
          <span>
            Danh sách: {rosterName} — vào nhầm, đang ở <b>{teamName(match.teamId)}</b>
          </span>
          <button className="mini-btn" onClick={() => moveAndSetCaptain(match.playerId, status.teamId, onNotice)}>
            Chuyển về &amp; đặt ★
          </button>
        </p>
      );
    default:
      return <p className="roster-line">Danh sách: {rosterName} — chưa thấy vào phòng</p>;
  }
}
