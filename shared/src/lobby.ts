export const TEAM_COUNT = 7;
export const TEAM_IDS = [1, 2, 3, 4, 5, 6, 7] as const;
export const MAX_NAME_LENGTH = 20;
export const ROOM_CODE_LENGTH = 4;

export type TeamId = number;

export function isTeamId(value: unknown): value is TeamId {
  return Number.isInteger(value) && (value as number) >= 1 && (value as number) <= TEAM_COUNT;
}

/** Chuẩn hóa tên hiển thị; trả null nếu không hợp lệ. */
export function normalizeName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const name = raw.replace(/\s+/g, ' ').trim();
  return name.length >= 1 && name.length <= MAX_NAME_LENGTH ? name : null;
}

export function isRoomCode(value: unknown): value is string {
  return typeof value === 'string' && new RegExp(`^\\d{${ROOM_CODE_LENGTH}}$`).test(value);
}

export interface PublicPlayer {
  id: string;
  name: string;
  online: boolean;
  /** Đang giữ quyền CHỐT (đã tính quy tắc chuyển quyền tạm thời). */
  isCaptain: boolean;
  /** Là đội trưởng được chỉ định (người vào đầu / admin chọn), dù đang mất kết nối. */
  isDesignatedCaptain: boolean;
}

export interface PublicTeam {
  id: TeamId;
  players: PublicPlayer[];
}

/** Trạng thái phòng gửi tới host, admin và người chơi (không chứa dữ liệu bí mật). */
export interface RoomState {
  code: string;
  lobbyOpen: boolean;
  teams: PublicTeam[];
}
