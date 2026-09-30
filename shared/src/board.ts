/**
 * Bàn cờ lục giác (GAME_SPEC 3.1, 3.2, 3.4, 3.6). Hàm thuần.
 *
 * Tọa độ axial (q, r), hướng đỉnh nhọn; khoảng cách tới tâm = max(|q|, |r|, |q+r|).
 * Mỗi ô có id số 0..36 theo thứ tự hàng (r tăng dần) rồi cột (q tăng dần) — dùng làm
 * "phương án" khi biểu quyết chọn ô và làm chỉ số của mảng `owners`.
 */
import { TEAM_IDS, type TeamId } from './lobby';

export type CellId = number;

export interface Hex {
  q: number;
  r: number;
}

export interface Cell extends Hex {
  id: CellId;
  /** Khoảng cách tới ô trung tâm (0 = ô Hiến pháp, 3 = vòng ngoài cùng). */
  ring: number;
}

export const BOARD_RADIUS = 3;

export function hexDistance(a: Hex, b: Hex): number {
  const dq = a.q - b.q;
  const dr = a.r - b.r;
  return Math.max(Math.abs(dq), Math.abs(dr), Math.abs(dq + dr));
}

const ORIGIN: Hex = { q: 0, r: 0 };

export const CELLS: readonly Cell[] = (() => {
  const cells: Cell[] = [];
  for (let r = -BOARD_RADIUS; r <= BOARD_RADIUS; r++) {
    for (let q = -BOARD_RADIUS; q <= BOARD_RADIUS; q++) {
      const ring = hexDistance({ q, r }, ORIGIN);
      if (ring <= BOARD_RADIUS) cells.push({ id: cells.length, q, r, ring });
    }
  }
  return cells;
})();

export const CELL_COUNT = CELLS.length;

const cellIndex = new Map(CELLS.map((c) => [`${c.q},${c.r}`, c.id]));

export function cellAt(q: number, r: number): CellId | null {
  return cellIndex.get(`${q},${r}`) ?? null;
}

export function isCellId(value: unknown): value is CellId {
  return Number.isInteger(value) && (value as number) >= 0 && (value as number) < CELL_COUNT;
}

/** 6 hướng axial. */
export const HEX_DIRECTIONS: readonly Hex[] = [
  { q: 1, r: 0 },
  { q: -1, r: 0 },
  { q: 0, r: 1 },
  { q: 0, r: -1 },
  { q: 1, r: -1 },
  { q: -1, r: 1 },
];

const neighborTable: readonly (readonly CellId[])[] = CELLS.map((c) =>
  HEX_DIRECTIONS.map((d) => cellAt(c.q + d.q, c.r + d.r)).filter((id): id is CellId => id !== null),
);

export function neighbors(id: CellId): readonly CellId[] {
  return neighborTable[id] ?? [];
}

export const CONSTITUTION_CELL: CellId = cellAt(0, 0)!;
/** Ô Hiến pháp tính 3 điểm. */
export const CONSTITUTION_POINTS = 3;

/**
 * Vòng ngoài cùng, đánh số 0–17 theo chiều kim đồng hồ trên màn hình, bắt đầu từ góc (0,-3):
 * (0,-3) → (3,-3) → (3,0) → (0,3) → (-3,3) → (-3,0) → (0,-3).
 */
export const OUTER_RING: readonly CellId[] = (() => {
  const walk: Hex[] = [
    { q: 1, r: 0 },
    { q: 0, r: 1 },
    { q: -1, r: 1 },
    { q: -1, r: 0 },
    { q: 0, r: -1 },
    { q: 1, r: -1 },
  ];
  const ring: CellId[] = [];
  let pos: Hex = { q: 0, r: -BOARD_RADIUS };
  for (const d of walk) {
    for (let i = 0; i < BOARD_RADIUS; i++) {
      ring.push(cellAt(pos.q, pos.r)!);
      pos = { q: pos.q + d.q, r: pos.r + d.r };
    }
  }
  return ring;
})();

/** Vị trí trên vòng ngoài của ô xuất phát Nhóm 1–7 (khoảng cách 3-2-3-2-3-2-3). */
export const START_RING_INDICES = [0, 3, 5, 8, 10, 13, 15] as const;

export function startCell(teamId: TeamId): CellId {
  return OUTER_RING[START_RING_INDICES[teamId - 1]!]!;
}

// ─── Trạng thái bàn cờ ────────────────────────────────────────────────────────

export type ShieldReason = 'constitution' | 'protection';

export interface ShieldGrant {
  teamId: TeamId;
  reason: ShieldReason;
}

export interface BoardState {
  /** Chủ của từng ô theo id (null = ô trống). */
  owners: (TeamId | null)[];
  /** Khiên có hiệu lực trong lượt đang chơi (trao ở lượt trước, hết hạn khi lượt này giải quyết xong). */
  shields: ShieldGrant[];
}

/** Bàn cờ đầu trận: nhóm có thành viên nhận ô xuất phát (GAME_SPEC 3.1). */
export function initialBoard(activeTeamIds: readonly TeamId[]): BoardState {
  const owners: (TeamId | null)[] = new Array(CELL_COUNT).fill(null);
  for (const t of TEAM_IDS) if (activeTeamIds.includes(t)) owners[startCell(t)] = t;
  return { owners, shields: [] };
}

export function isShielded(board: BoardState, teamId: TeamId): boolean {
  return board.shields.some((s) => s.teamId === teamId);
}

export function cellsOf(board: BoardState, teamId: TeamId): CellId[] {
  const out: CellId[] = [];
  board.owners.forEach((o, id) => {
    if (o === teamId) out.push(id);
  });
  return out;
}

export type TargetError = 'NOT_ON_BOARD' | 'OWN_CELL' | 'SHIELDED' | 'NOT_ADJACENT';

/**
 * Vì sao nhóm không được nhắm ô này (null = hợp lệ) — GAME_SPEC 3.2:
 * không thuộc nhóm mình, không thuộc nhóm có khiên, và kề ít nhất một ô của nhóm mình;
 * nhóm không còn ô nào thì được nhắm bất kỳ ô vòng ngoài.
 */
export function targetError(board: BoardState, teamId: TeamId, cellId: CellId): TargetError | null {
  if (!isCellId(cellId)) return 'NOT_ON_BOARD';
  const owner = board.owners[cellId] ?? null;
  if (owner === teamId) return 'OWN_CELL';
  if (owner !== null && isShielded(board, owner)) return 'SHIELDED';
  const hasCells = board.owners.includes(teamId);
  const reachable = hasCells
    ? neighbors(cellId).some((n) => board.owners[n] === teamId)
    : CELLS[cellId]!.ring === BOARD_RADIUS;
  return reachable ? null : 'NOT_ADJACENT';
}

/** Các ô nhóm được nhắm tới trong lượt này, sắp theo id. */
export function validTargets(board: BoardState, teamId: TeamId): CellId[] {
  return CELLS.filter((c) => targetError(board, teamId, c.id) === null).map((c) => c.id);
}

/** Điểm = số ô sở hữu, ô Hiến pháp tính 3 (GAME_SPEC 3.6). */
export function scoreOf(board: BoardState, teamId: TeamId): number {
  return cellsOf(board, teamId).reduce((sum, id) => sum + (id === CONSTITUTION_CELL ? CONSTITUTION_POINTS : 1), 0);
}
