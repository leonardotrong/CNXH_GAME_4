/**
 * Giải quyết một lượt Bàn Cờ (GAME_SPEC 3.3–3.5). Hàm thuần: không sửa đầu vào.
 *
 * Mọi thứ tính trên trạng thái ĐẦU lượt (`input.board`):
 * 1. Kiểm tra lại mục tiêu của từng nhóm (ngoài bàn cờ / ô của mình / không kề → bỏ qua).
 *    Ô của nhóm có khiên vẫn được ghi nhận để báo "bị khiên chặn".
 * 2. Mỗi ô bị nhắm giải quyết độc lập (mỗi nhóm chỉ nhắm 1 ô):
 *    - chủ có khiên → mọi tấn công vô hiệu;
 *    - ứng viên = kẻ tấn công trả lời đúng + chủ ô nếu chủ trả lời đúng (dù chủ nhắm ô khác);
 *    - không có kẻ tấn công nào đúng → giữ nguyên;
 *    - ứng viên chốt sớm nhất thắng; trùng mili-giây ở vị trí sớm nhất → giữ nguyên.
 * 3. Khiên cho lượt kế tiếp (khiên cũ hết hạn): chiếm được ô Hiến pháp → Khiên Hiến pháp;
 *    mất ≥ 2 ô → Khiên bảo hộ.
 */
import {
  CONSTITUTION_CELL,
  isShielded,
  targetError,
  type BoardState,
  type CellId,
  type ShieldGrant,
  type TargetError,
} from './board';
import type { TeamId } from './lobby';

/** Kết quả câu hỏi của một nhóm. `lockedAt` = thời điểm server ghi nhận chốt (ms). */
export interface TeamAnswer {
  correct: boolean;
  lockedAt: number;
}

export interface TurnInput {
  /** Bàn cờ đầu lượt (kèm khiên đang có hiệu lực trong lượt này). */
  board: BoardState;
  /** Ô mục tiêu nhóm đã chốt ở SELECT (null/vắng = bỏ lượt). */
  targets: Readonly<Partial<Record<TeamId, CellId | null>>>;
  /** Kết quả câu hỏi (vắng = coi như sai). */
  answers: Readonly<Partial<Record<TeamId, TeamAnswer>>>;
}

export type CellResult =
  /** Ô đổi chủ. */
  | 'captured'
  /** Chủ ô trả lời đúng và chốt sớm hơn mọi kẻ tấn công trả lời đúng. */
  | 'defended'
  /** Không kẻ tấn công nào trả lời đúng. */
  | 'failed'
  /** Nhiều ứng viên cùng chốt sớm nhất (trùng ms) → giữ nguyên. */
  | 'tie'
  /** Chủ ô có khiên → mọi tấn công vô hiệu. */
  | 'shielded';

export interface Contender {
  teamId: TeamId;
  role: 'attacker' | 'defender';
  correct: boolean;
  lockedAt: number | null;
}

export interface CellOutcome {
  cellId: CellId;
  previousOwner: TeamId | null;
  newOwner: TeamId | null;
  result: CellResult;
  /** Các nhóm nhắm ô này (tăng dần). */
  attackers: TeamId[];
  /** Ứng viên thắng (duy nhất) — chỉ có khi 'captured' hoặc 'defended'. */
  winner: TeamId | null;
  /** Chênh lệch ms giữa người thắng và ứng viên đúng kế tiếp (null nếu không có tranh chấp). */
  marginMs: number | null;
  /** Kẻ tấn công + chủ ô: trả lời đúng trước (theo thời điểm chốt), sai sau (theo số nhóm). */
  contenders: Contender[];
  /** Ô có ★ Lòng dân lúc đầu lượt (GAME_SPEC 3.7). */
  star: boolean;
}

export interface IgnoredTarget {
  teamId: TeamId;
  cellId: CellId;
  reason: Exclude<TargetError, 'SHIELDED'>;
}

export interface TurnOutcome {
  /** Các ô bị nhắm hợp lệ, sắp theo id ô. */
  cells: CellOutcome[];
  ignored: IgnoredTarget[];
  /** Số ô bị chiếm mất / chiếm được của từng nhóm (chỉ nhóm > 0). */
  losses: Partial<Record<TeamId, number>>;
  gains: Partial<Record<TeamId, number>>;
  /** Khiên cho lượt kế tiếp (= `board.shields` mới). */
  shieldsGranted: ShieldGrant[];
}

const SHIELD_ORDER: Record<ShieldGrant['reason'], number> = { constitution: 0, protection: 1 };

function byContenderOrder(a: Contender, b: Contender): number {
  if (a.correct !== b.correct) return a.correct ? -1 : 1;
  if (a.correct && a.lockedAt !== b.lockedAt) return a.lockedAt! - b.lockedAt!;
  return a.teamId - b.teamId;
}

function contender(teamId: TeamId, role: Contender['role'], answer: TeamAnswer | undefined): Contender {
  return {
    teamId,
    role,
    correct: answer?.correct === true,
    lockedAt: answer ? answer.lockedAt : null,
  };
}

function resolveCell(
  board: BoardState,
  cellId: CellId,
  attackers: TeamId[],
  answers: TurnInput['answers'],
): CellOutcome {
  const previousOwner = board.owners[cellId] ?? null;
  const contenders = attackers.map((t) => contender(t, 'attacker', answers[t]));
  if (previousOwner !== null) contenders.push(contender(previousOwner, 'defender', answers[previousOwner]));
  contenders.sort(byContenderOrder);

  const base = { cellId, previousOwner, attackers, contenders, star: board.stars.includes(cellId) };
  const unchanged = (result: CellResult, winner: TeamId | null = null, marginMs: number | null = null): CellOutcome => ({
    ...base, newOwner: previousOwner, result, winner, marginMs,
  });

  if (previousOwner !== null && isShielded(board, previousOwner)) return unchanged('shielded');

  const candidates = contenders.filter((c) => c.correct);
  if (!candidates.some((c) => c.role === 'attacker')) return unchanged('failed');

  const [first, second] = candidates as [Contender, ...Contender[]];
  const marginMs = second ? second.lockedAt! - first.lockedAt! : null;
  if (marginMs === 0) return unchanged('tie', null, 0);
  if (first.role === 'defender') return unchanged('defended', first.teamId, marginMs);
  return { ...base, newOwner: first.teamId, result: 'captured', winner: first.teamId, marginMs };
}

export function resolveTurn(input: TurnInput): { board: BoardState; outcome: TurnOutcome } {
  const { board, targets, answers } = input;

  // 1. Gom mục tiêu hợp lệ theo ô.
  const attackersByCell = new Map<CellId, TeamId[]>();
  const ignored: IgnoredTarget[] = [];
  const teamIds = Object.keys(targets).map(Number).sort((a, b) => a - b);
  for (const teamId of teamIds) {
    const cellId = targets[teamId];
    if (cellId === null || cellId === undefined) continue;
    const error = targetError(board, teamId, cellId);
    if (error !== null && error !== 'SHIELDED') {
      ignored.push({ teamId, cellId, reason: error });
      continue;
    }
    attackersByCell.set(cellId, [...(attackersByCell.get(cellId) ?? []), teamId]);
  }

  // 2. Giải quyết từng ô trên trạng thái đầu lượt.
  const cells = [...attackersByCell.keys()]
    .sort((a, b) => a - b)
    .map((cellId) => resolveCell(board, cellId, attackersByCell.get(cellId)!, answers));

  const owners = [...board.owners];
  const losses: Partial<Record<TeamId, number>> = {};
  const gains: Partial<Record<TeamId, number>> = {};
  for (const cell of cells) {
    if (cell.result !== 'captured') continue;
    owners[cell.cellId] = cell.newOwner;
    gains[cell.newOwner!] = (gains[cell.newOwner!] ?? 0) + 1;
    if (cell.previousOwner !== null) losses[cell.previousOwner] = (losses[cell.previousOwner] ?? 0) + 1;
  }

  // 3. Khiên cho lượt kế tiếp.
  const shields: ShieldGrant[] = [];
  const constitution = cells.find((c) => c.cellId === CONSTITUTION_CELL && c.result === 'captured');
  if (constitution) shields.push({ teamId: constitution.newOwner!, reason: 'constitution' });
  for (const [teamId, lost] of Object.entries(losses)) {
    if (lost! >= 2) shields.push({ teamId: Number(teamId), reason: 'protection' });
  }
  shields.sort((a, b) => a.teamId - b.teamId || SHIELD_ORDER[a.reason] - SHIELD_ORDER[b.reason]);

  return {
    // ★ (và mọi thuộc tính khác của bàn cờ) giữ nguyên; chỉ chủ ô và khiên đổi.
    board: { ...board, owners, shields },
    outcome: { cells, ignored, losses, gains, shieldsGranted: shields.map((s) => ({ ...s })) },
  };
}
