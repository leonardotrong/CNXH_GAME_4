/**
 * Chế độ dự phòng (GAME_SPEC 5.3): người dẫn nhập tay kết quả từ thẻ màu A/B/C/D.
 * Thứ tự nhanh chậm (hạng 1, 2, 3…) quy đổi thành thời điểm chốt để dùng lại nguyên luật 3.3.
 */

/** Mỗi hạng cách nhau 1 giây. */
export const FALLBACK_RANK_STEP_MS = 1_000;

/** Hạng (≥ 1) → thời điểm chốt. Cùng hạng = cùng mili-giây (tranh chấp → ô giữ nguyên). */
export function rankToLockedAt(startedAt: number, rank: number): number {
  const r = Number.isFinite(rank) ? Math.max(1, Math.round(rank)) : 1;
  return startedAt + r * FALLBACK_RANK_STEP_MS;
}

/** Nhập tay cho một nhóm trong câu hỏi: phương án (null = không giơ thẻ) và hạng nhanh chậm. */
export interface FallbackAnswer {
  teamId: number;
  choice: number | null;
  rank: number;
}
