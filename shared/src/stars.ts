/**
 * ★ Lòng dân (GAME_SPEC 3.7): khi bắt đầu các lượt chia hết cho 3, server đặt một ngôi sao lên một ô;
 * ô có ★ được 2 điểm cho nhóm đang giữ ô (cướp được như mọi ô). Hàm thuần — ngẫu nhiên do server truyền `rng`.
 *
 * Sao không rơi cho nhóm dẫn đầu và ưu tiên ô mà ít nhất 2 nhóm khác cùng nhắm được, để tạo tranh chấp
 * (ý tưởng ngôi sao Mario Party + "rubber-banding" của Mario Kart).
 */
import { CELLS, CONSTITUTION_CELL, isShielded, organAt, scoreOf, targetError, type BoardState, type CellId } from './board';
import type { TeamId } from './lobby';
import type { Rng } from './questions';

/** ★ xuất hiện khi bắt đầu lượt 3, 6, 9, 12… */
export const STAR_EVERY = 3;

export function isStarTurn(turn: number): boolean {
  return turn > 0 && turn % STAR_EVERY === 0;
}

/** Bàn cờ có thêm ★ ở `cellId` (không trùng). */
export function withStar(board: BoardState, cellId: CellId): BoardState {
  return board.stars.includes(cellId) ? board : { ...board, stars: [...board.stars, cellId] };
}

/**
 * Ô cho ★ mới trên bàn cờ đầu lượt (đã tính khiên của lượt), hoặc null nếu không còn ô phù hợp:
 * - nhóm dẫn đầu = nhóm có điểm cao nhất trong `activeTeamIds` (mọi nhóm bằng điểm → không có);
 * - ô được xét: không phải ô Hiến pháp, ô Cơ quan, ô đã có ★; không thuộc nhóm dẫn đầu hay nhóm có khiên;
 * - ưu tiên: (a) ô trống ≥ 2 nhóm không dẫn đầu nhắm được → (b) ô bất kỳ như vậy → (c) ≥ 1 nhóm → (d) ô trống bất kỳ;
 * - chọn đều ngẫu nhiên trong mức ưu tiên đầu tiên còn ô (ô sắp theo id).
 */
export function pickStarCell(board: BoardState, activeTeamIds: readonly TeamId[], rng: Rng = Math.random): CellId | null {
  const scores = activeTeamIds.map((t) => scoreOf(board, t));
  const top = Math.max(...scores);
  const leaders = scores.some((s) => s !== top) ? activeTeamIds.filter((_, i) => scores[i] === top) : [];
  const challengers = activeTeamIds.filter((t) => !leaders.includes(t));

  const eligible = CELLS.map((c) => c.id).filter((id) => {
    if (id === CONSTITUTION_CELL || organAt(id) || board.stars.includes(id)) return false;
    const owner = board.owners[id] ?? null;
    return owner === null || (!leaders.includes(owner) && !isShielded(board, owner));
  });
  // targetError loại sẵn chủ ô (OWN_CELL), nên chủ ô không tính vào số nhóm nhắm được.
  const reach = (id: CellId) => challengers.filter((t) => targetError(board, t, id) === null).length;
  const empty = (id: CellId) => board.owners[id] === null;

  const tiers = [
    eligible.filter((id) => empty(id) && reach(id) >= 2),
    eligible.filter((id) => reach(id) >= 2),
    eligible.filter((id) => reach(id) >= 1),
    eligible.filter(empty),
  ];
  const pool = tiers.find((t) => t.length > 0);
  if (!pool) return null;
  return pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))]!;
}
