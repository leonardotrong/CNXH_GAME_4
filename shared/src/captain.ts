/**
 * Chọn và chuyển đội trưởng (GAME_SPEC 2.1). Toàn bộ là hàm thuần.
 *
 * - "Đội trưởng được chỉ định" (designated) = người vào nhóm đầu tiên, hoặc do admin đổi.
 * - "Đội trưởng hiệu lực" (effective) = người đang giữ quyền CHỐT: đội trưởng được chỉ định,
 *   trừ khi họ mất kết nối quá CAPTAIN_GRACE_MS — khi đó quyền tạm chuyển cho thành viên
 *   đang online vào nhóm sớm nhất, và trả lại khi đội trưởng quay lại.
 */
export const CAPTAIN_GRACE_MS = 10_000;

export interface CaptainCandidate {
  id: string;
  /** Số thứ tự tăng dần, ghi lúc người chơi vào nhóm hiện tại. */
  teamJoinSeq: number;
  online: boolean;
  /** Thời điểm (ms) mất kết nối; null nếu đang online. */
  offlineSince: number | null;
}

function earliest<T extends { teamJoinSeq: number }>(members: readonly T[]): T | null {
  let best: T | null = null;
  for (const m of members) if (best === null || m.teamJoinSeq < best.teamJoinSeq) best = m;
  return best;
}

/** Người vào nhóm sớm nhất (bất kể online) — dùng khi nhóm chưa có hoặc vừa mất đội trưởng. */
export function pickDesignatedCaptain(members: readonly CaptainCandidate[]): string | null {
  return earliest(members)?.id ?? null;
}

/** Giữ đội trưởng hiện tại nếu còn trong nhóm; nếu không, chọn người vào sớm nhất. */
export function resolveDesignatedCaptain(
  members: readonly CaptainCandidate[],
  current: string | null,
): string | null {
  if (current !== null && members.some((m) => m.id === current)) return current;
  return pickDesignatedCaptain(members);
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
