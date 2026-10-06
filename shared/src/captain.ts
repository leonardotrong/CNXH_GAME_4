/**
 * Chọn và chuyển đội trưởng (GAME_SPEC 2.1). Toàn bộ là hàm thuần.
 *
 * - "Đội trưởng được chỉ định" (designated) = người vào nhóm đầu tiên, người có tên là số nhóm
 *   (nhóm trưởng tự nhận khi vào nhóm), hoặc do admin đổi.
 * - "Đội trưởng hiệu lực" (effective) = người đang giữ quyền CHỐT: đội trưởng được chỉ định,
 *   trừ khi họ mất kết nối quá CAPTAIN_GRACE_MS — khi đó quyền tạm chuyển cho thành viên
 *   đang online vào nhóm sớm nhất, và trả lại khi đội trưởng quay lại.
 */
import { isTeamId, type RoomState, type TeamId } from './lobby';

export const CAPTAIN_GRACE_MS = 10_000;

/**
 * Nhóm trưởng đặt tên là số nhóm (GAME_SPEC 2.1): tên chỉ gồm số nhóm, có thể kèm "Nhóm", "N" hoặc "NT" phía trước
 * ("1", "Nhóm 1", "nhom1", "N1", "NT 1") → số nhóm đó; tên khác (kể cả "1 An") → null.
 * Không phân biệt hoa thường, dấu, khoảng trắng, dấu câu; chữ số toàn khổ của bàn phím điện thoại cũng được.
 */
export function captainSignal(name: string): TeamId | null {
  const folded = name
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, '');
  const m = /^(?:nhom|nt|n)?0*(\d+)$/.exec(folded);
  const teamId = m ? Number(m[1]) : null;
  return isTeamId(teamId) ? teamId : null;
}

export interface CaptainCandidate {
  id: string;
  /** Số thứ tự tăng dần, ghi lúc người chơi vào nhóm hiện tại. */
  teamJoinSeq: number;
  online: boolean;
  /** Thời điểm (ms) mất kết nối; null nếu đang online. */
  offlineSince: number | null;
  /** Tên là số của chính nhóm này (`captainSignal`) — nhóm trưởng tự nhận. */
  namedCaptain?: boolean;
}

function earliest<T extends { teamJoinSeq: number }>(members: readonly T[]): T | null {
  let best: T | null = null;
  for (const m of members) if (best === null || m.teamJoinSeq < best.teamJoinSeq) best = m;
  return best;
}

/**
 * Người vào nhóm sớm nhất (bất kể online), ưu tiên người có tên là số nhóm — dùng khi nhóm chưa có
 * hoặc vừa mất đội trưởng.
 */
export function pickDesignatedCaptain(members: readonly CaptainCandidate[]): string | null {
  return (earliest(members.filter((m) => m.namedCaptain)) ?? earliest(members))?.id ?? null;
}

/** Giữ đội trưởng hiện tại nếu còn trong nhóm; nếu không, chọn lại theo `pickDesignatedCaptain`. */
export function resolveDesignatedCaptain(
  members: readonly CaptainCandidate[],
  current: string | null,
): string | null {
  if (current !== null && members.some((m) => m.id === current)) return current;
  return pickDesignatedCaptain(members);
}

/**
 * Đội trưởng sau khi `enteredId` vừa vào nhóm (vào phòng, tự đổi nhóm, được admin chuyển vào — GAME_SPEC 2.1):
 * người vào có tên là số nhóm thì thành đội trưởng, trừ khi đội trưởng hiện tại cũng có tên như vậy (người đến trước giữ).
 * Chỉ xét người vừa vào, không quét lại cả nhóm — đội trưởng do admin chọn giữ nguyên khi người khác ra vào.
 */
export function captainAfterEntry(
  members: readonly CaptainCandidate[],
  current: string | null,
  enteredId: string,
): string | null {
  const entered = members.find((m) => m.id === enteredId);
  const holder = members.find((m) => m.id === current);
  if (entered?.namedCaptain && !holder?.namedCaptain) return entered.id;
  return resolveDesignatedCaptain(members, current);
}

/** Đội trưởng đang có quyền CHỐT tại thời điểm `now`. */
export function effectiveCaptain(
  members: readonly CaptainCandidate[],
  designatedId: string | null,
  now: number,
  graceMs: number = CAPTAIN_GRACE_MS,
): string | null {
  const designated = members.find((m) => m.id === designatedId);
  if (!designated) return pickDesignatedCaptain(members);
  const withinGrace =
    designated.online || (designated.offlineSince !== null && now - designated.offlineSince <= graceMs);
  if (withinGrace) return designated.id;
  const stand = earliest(members.filter((m) => m.online));
  // Cả nhóm offline: vẫn giữ đội trưởng được chỉ định.
  return stand?.id ?? designated.id;
}

/** Nhóm trưởng tự nhận bằng tên của một nhóm (GAME_SPEC 2.1) — cho dòng tình trạng đội trưởng trên /admin. */
export interface NamedCaptainInfo {
  teamId: TeamId;
  /** Người trong nhóm có tên là số nhóm, theo thứ tự vào nhóm. */
  inTeam: string[];
  /** Người có tên là số của nhóm này nhưng đang ở nhóm khác (vào nhầm nhóm). */
  elsewhere: { playerId: string; teamId: TeamId }[];
}

/** Ai đặt tên là số nhóm nào, theo từng nhóm (thứ tự nhóm; danh sách người theo thứ tự vào nhóm như `RoomState`). */
export function namedCaptainInfo(state: Pick<RoomState, 'teams'>): NamedCaptainInfo[] {
  const info = state.teams.map((t): NamedCaptainInfo => ({ teamId: t.id, inTeam: [], elsewhere: [] }));
  for (const t of state.teams) {
    for (const p of t.players) {
      const target = info.find((x) => x.teamId === captainSignal(p.name));
      if (!target) continue;
      if (target.teamId === t.id) target.inTeam.push(p.id);
      else target.elsewhere.push({ playerId: p.id, teamId: t.id });
    }
  }
  return info;
}
