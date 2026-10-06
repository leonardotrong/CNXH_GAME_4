/**
 * Bàn cờ ví dụ "giữa trận" cho bản đồ minh họa ở màn luật (GAME_SPEC 5.1 RULES) — cho cả lớp hình dung trận đấu
 * trông thế nào trước khi chơi. Cố định và đúng luật (có test): mỗi nhóm 3 ô lan từ ô xuất phát ở viền vào giữa;
 * Nhóm 1 giữ Quốc hội, Nhóm 7 giữ Viện kiểm sát, Chính phủ và Tòa án còn trống; ô Hiến pháp chưa ai chiếm, Nhóm 1 và
 * Nhóm 7 cùng nhắm (tranh chấp → nhóm chốt sớm hơn thắng); Nhóm 4 nhắm ô Tòa án; ★ Lòng dân trên một ô trống.
 */
import { CELL_COUNT, cellAt, type BoardState, type CellId } from './board';
import type { TeamId } from './lobby';

/** Lãnh thổ từng nhóm (tọa độ axial), ô đầu là ô xuất phát. */
const TERRITORIES: Record<TeamId, [number, number][]> = {
  1: [[0, -3], [0, -2], [0, -1]],
  2: [[3, -3], [2, -2], [1, -2]],
  3: [[3, -1], [2, -1], [2, 0]],
  4: [[1, 2], [1, 1], [0, 2]],
  5: [[-1, 3], [-1, 2], [0, 3]],
  6: [[-3, 2], [-2, 2], [-2, 1]],
  7: [[-3, 0], [-2, 0], [-1, 0]],
};

const at = (q: number, r: number): CellId => {
  const id = cellAt(q, r);
  if (id === null) throw new Error(`Ô (${q},${r}) không có trên bàn cờ`);
  return id;
};

export interface RulesExample {
  board: BoardState;
  /** Mục tiêu một vài nhóm đang nhắm (vẽ thành chấm tròn mang số nhóm trên ô). */
  targets: Record<TeamId, CellId | null>;
}

export const RULES_EXAMPLE: RulesExample = (() => {
  const owners: (TeamId | null)[] = new Array(CELL_COUNT).fill(null);
  for (const [team, cells] of Object.entries(TERRITORIES)) for (const [q, r] of cells) owners[at(q, r)] = Number(team);
  return {
    board: { owners, shields: [], stars: [at(-1, 1)] },
    targets: { 1: at(0, 0), 4: at(0, 1), 7: at(0, 0) },
  };
})();
