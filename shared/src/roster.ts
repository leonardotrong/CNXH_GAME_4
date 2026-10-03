/**
 * Danh sách nhóm trưởng thực tế (GAME_SPEC 2.1): người dẫn nhập họ tên nhóm trưởng của từng nhóm trên /admin
 * rồi đặt đội trưởng theo danh sách bằng một lần bấm. Hàm thuần: so tên người chơi tự gõ với danh sách.
 * Khớp tên chỉ là gợi ý — người dẫn luôn thấy trước người sẽ được đặt và sửa tay được.
 */
import { MAX_NAME_LENGTH, isTeamId, type RoomState, type TeamId } from './lobby';

/** Họ tên nhóm trưởng thực tế theo nhóm (nhóm không có tên → bỏ qua). */
export type CaptainRoster = Partial<Record<TeamId, string>>;

/** Bỏ dấu tiếng Việt (đ → d), chữ thường, chỉ giữ chữ và số: "  Nguyễn  Văn Ân " → "nguyen van an". */
export function foldName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Tên có dấu tiếng Việt (dấu thanh, mũ, móc, hoặc chữ đ), tức người gõ dùng bộ gõ tiếng Việt. */
function hasMarks(name: string): boolean {
  return /\p{M}/u.test(name.normalize('NFD')) || /[đĐ]/.test(name);
}

/** Các chữ của một tên: chữ thường, giữ dấu, bỏ ghi chú trong ngoặc ("Thảo (NT)") và dấu câu. */
function tokens(name: string): string[] {
  return name
    .normalize('NFC')
    .toLowerCase()
    .replace(/\([^)]*\)|\[[^\]]*\]/g, ' ')
    .split(/[^\p{L}\p{M}\p{N}]+/u)
    .filter(Boolean);
}

/** 'exact' = đủ họ tên trùng nhau; 'partial' = một tên là phần của tên kia và có chung tên gọi. */
export type NameMatch = 'exact' | 'partial';

/**
 * Mức khớp giữa tên người chơi tự gõ và tên trong danh sách (không phân biệt hoa thường, dấu câu, ghi chú trong ngoặc):
 * - Dấu: hai bên đều gõ có dấu thì dấu phân biệt tên ("Hùng" ≠ "Hưng", "Thu" ≠ "Thư"); một bên gõ không dấu thì so bỏ dấu.
 * - Tên gọi = chữ cuối của tên trong danh sách; họ ("Nguyễn") hay tên đệm ("Văn") một mình không tính.
 * - Gõ tắt được: "An", "Văn An", "Nguyễn An", "An Nguyễn", chữ viết tắt ("Nguyễn T. Phương Thảo").
 * - Tên dài bị cắt ở giới hạn MAX_NAME_LENGTH: chữ cuối được là phần đầu của chữ tương ứng ("… Phương Th" ↔ "… Phương Thảo").
 */
export function matchName(playerName: string, rosterName: string): NameMatch | null {
  const typed = tokens(playerName);
  const listed = tokens(rosterName);
  if (typed.length === 0 || listed.length === 0) return null;
  const loose = !hasMarks(playerName) || !hasMarks(rosterName);
  const norm = (w: string) => (loose ? foldName(w) : w);
  const last = typed.length - 1;
  const cut = playerName.trim().length >= MAX_NAME_LENGTH;
  /** Chữ thứ `i` người chơi gõ là chữ `w` của danh sách (chữ cuối của tên bị cắt: phần đầu của `w`, từ 2 chữ cái). */
  const same = (i: number, w: string) => {
    const t = norm(typed[i]!);
    return t === norm(w) || (cut && i === last && t.length >= 2 && norm(w).startsWith(t));
  };
  /** Chữ viết tắt: "T." cho "Thị". */
  const initial = (i: number, w: string) => typed[i]!.length === 1 && foldName(typed[i]!) === foldName(w).charAt(0);

  if (typed.length === listed.length && listed.every((w, i) => same(i, w))) return 'exact';
  const given = listed[listed.length - 1]!;
  // Gõ tắt: mọi chữ gõ đều có trong danh sách (hoặc là chữ viết tắt), và có gõ đủ tên gọi.
  if (typed.every((_, i) => listed.some((w) => same(i, w) || initial(i, w))) && typed.some((_, i) => same(i, given))) return 'partial';
  // Danh sách ghi tắt ("An" ↔ "Nguyễn Văn An"): mọi chữ của danh sách đều có trong tên gõ và tên gọi là chữ cuối
  // (không khớp "An Khang" — ở đó "An" là tên đệm).
  if (listed.every((w) => typed.some((_, i) => same(i, w))) && same(last, given)) return 'partial';
  return null;
}

/** Người chơi để so với danh sách. */
export interface RosterPlayer {
  id: string;
  name: string;
  teamId: TeamId;
}

export type RosterMatch =
  /** Đúng một người trong nhóm khớp. */
  | { kind: 'match'; playerId: string }
  /** Nhiều người trong nhóm khớp như nhau → người dẫn chọn tay. */
  | { kind: 'ambiguous'; playerIds: string[] }
  /** Gõ đủ họ tên nhưng đang ở nhóm khác (vào nhầm nhóm). */
  | { kind: 'elsewhere'; playerId: string; teamId: TeamId }
  /** Chưa thấy ai khớp. */
  | { kind: 'none' };

/**
 * Tìm người ứng với tên `rosterName` của nhóm `teamId`:
 * 1. trong nhóm, người gõ đủ họ tên (chỉ tính khi danh sách ghi từ 2 chữ trở lên — một chữ thì quá dễ trùng);
 * 2. người gõ đủ họ tên nhưng ở nhóm khác (duy nhất trong phòng) → báo vào nhầm nhóm;
 * 3. trong nhóm, người gõ tắt (hoặc khớp đủ với tên một chữ).
 * Một bậc có nhiều người khớp → ambiguous.
 */
export function findRosterCaptain(rosterName: string, teamId: TeamId, players: readonly RosterPlayer[]): RosterMatch {
  const listedWords = tokens(rosterName).length;
  if (listedWords === 0) return { kind: 'none' };
  const strong = (p: RosterPlayer) => listedWords >= 2 && matchName(p.name, rosterName) === 'exact';
  const weak = (p: RosterPlayer) => matchName(p.name, rosterName) !== null;
  const pick = (found: RosterPlayer[]): RosterMatch | null =>
    found.length === 1 ? { kind: 'match', playerId: found[0]!.id }
    : found.length > 1 ? { kind: 'ambiguous', playerIds: found.map((p) => p.id) }
    : null;

  const inTeam = players.filter((p) => p.teamId === teamId);
  const strongIn = pick(inTeam.filter(strong));
  if (strongIn) return strongIn;
  const strongOut = players.filter((p) => p.teamId !== teamId && strong(p));
  if (strongOut.length === 1) return { kind: 'elsewhere', playerId: strongOut[0]!.id, teamId: strongOut[0]!.teamId };
  return pick(inTeam.filter(weak)) ?? { kind: 'none' };
}

/** Tình trạng một nhóm so với danh sách. */
export interface RosterTeamStatus {
  teamId: TeamId;
  rosterName: string;
  match: RosterMatch;
  /** Người khớp đã là đội trưởng (được chỉ định) của nhóm. */
  applied: boolean;
}

/** Tình trạng các nhóm có tên trong danh sách, theo thứ tự nhóm. */
export function rosterStatus(roster: CaptainRoster, state: Pick<RoomState, 'teams'>): RosterTeamStatus[] {
  const players = state.teams.flatMap((t) => t.players.map((p) => ({ id: p.id, name: p.name, teamId: t.id })));
  const result: RosterTeamStatus[] = [];
  for (const t of state.teams) {
    const rosterName = roster[t.id]?.trim() ?? '';
    if (!rosterName) continue;
    const match = findRosterCaptain(rosterName, t.id, players);
    const applied = match.kind === 'match' && t.players.some((p) => p.id === match.playerId && p.isDesignatedCaptain);
    result.push({ teamId: t.id, rosterName, match, applied });
  }
  return result;
}

/** Việc "Đặt theo danh sách" sẽ làm: các nhóm có đúng một người khớp mà người đó chưa là đội trưởng. */
export function rosterChanges(statuses: readonly RosterTeamStatus[]): { teamId: TeamId; playerId: string }[] {
  return statuses.flatMap((s) => (s.match.kind === 'match' && !s.applied ? [{ teamId: s.teamId, playerId: s.match.playerId }] : []));
}

/** Một dòng của danh sách dán vào: số nhóm (nếu dòng có ghi) + họ tên. */
export interface RosterLine {
  teamId: TeamId | null;
  name: string;
}

/** Gạch đầu dòng ở đầu ô: "• ", "- ", "+ ", "* ", "> ". */
const BULLET = /^[\s•·∙◦▪●○■□\-–—+*>]+/u;
/** "Nhóm 3:", "nhom 3", "N3 -", "3.", "3)", hoặc ô "3" của Excel. */
const NUMBERING = /^\s*(?:nh[oó]m|n)?\s*(\d+)\s*[:.)\-–—]?\s*/iu;

/** Dòng tiêu đề khi chép cả cột từ Excel ("STT", "Họ và tên", "Nhóm trưởng") — so có dấu để không nhầm tên thật như "Hồ Thu". */
const HEADER_WORDS = new Set(['stt', 'tt', 'họ', 'và', 'tên', 'nhóm', 'trưởng', 'số', 'thứ', 'tự', 'danh', 'sách', 'lớp', 'mssv', 'ghi', 'chú']);
function isHeaderLine(line: string): boolean {
  const ws = line.toLowerCase().split(/\s+/).filter(Boolean);
  return ws.length > 0 && ws.every((w) => HEADER_WORDS.has(w)) && ws.some((w) => w === 'tên' || w === 'stt' || w === 'trưởng' || w === 'mssv');
}

/**
 * Tách danh sách dán vào /admin (mỗi dòng một nhóm, từ ghi chú hay Excel) thành các họ tên.
 * Dòng có số nhóm 1–7 ("Nhóm 3: An", "3. An", cột "Nhóm 3" trước/sau cột tên) → gán đúng nhóm đó.
 * Bỏ dòng trống, gạch đầu dòng và dòng tiêu đề (để danh sách không bị lệch một nhóm).
 */
export function parseRosterText(text: string): RosterLine[] {
  const lines: RosterLine[] = [];
  for (const raw of text.normalize('NFC').split(/\r?\n/)) {
    let teamId: TeamId | null = null;
    let name = '';
    for (const cell of raw.split('\t').map((c) => c.replace(BULLET, ''))) {
      const numbered = NUMBERING.exec(cell);
      if (numbered && teamId === null && isTeamId(Number(numbered[1]))) teamId = Number(numbered[1]);
      const rest = (numbered ? cell.slice(numbered[0].length) : cell).replace(/\s+/g, ' ').trim();
      if (rest && !name) name = rest;
    }
    if (name && (teamId !== null || !isHeaderLine(raw))) lines.push({ teamId, name });
  }
  return lines;
}
