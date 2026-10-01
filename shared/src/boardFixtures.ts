/** Tiện ích dựng bàn cờ cho unit test (không xuất ra từ index). */
import { CELL_COUNT, cellAt, type BoardState, type ShieldGrant } from './board';
import type { TeamId } from './lobby';

/** Id của ô (q, r); ném lỗi nếu ngoài bàn cờ. */
export const c = (q: number, r: number): number => {
  const id = cellAt(q, r);
  if (id === null) throw new Error(`(${q},${r}) ngoài bàn cờ`);
  return id;
};

/** Dựng bàn cờ từ danh sách [q, r, nhóm]. */
export function mk(cells: [number, number, TeamId][], shields: ShieldGrant[] = []): BoardState {
  const owners: (TeamId | null)[] = new Array(CELL_COUNT).fill(null);
  for (const [q, r, t] of cells) owners[c(q, r)] = t;
  return { owners, shields };
}
