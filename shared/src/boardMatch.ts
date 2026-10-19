/**
 * Tiến trình trận Bàn Cờ Quyền Lực qua các lượt (GAME_SPEC 3.2, 3.6). Hàm thuần.
 * Server chỉ điều phối pha và timer: SELECT → QUESTION → REVEAL → lượt kế / kết thúc.
 */
import type { BoardState, CellId, ShieldGrant } from './board';
import type { PublicBombView } from './bomb';
import { initialBoard } from './board';
import { TEAM_IDS, type TeamId } from './lobby';
import type { Phase } from './phases';
import type { QuestionRound } from './questionRound';
import type { Rng } from './questions';
import { resolveTurn, type TurnOutcome } from './resolveTurn';
import type { PublicSelectView } from './selectRound';
import { isStarTurn, pickStarCell, withStar } from './stars';
import { answersFromRound, emptyStats, rankTeams, recordAnswers, type MatchStats, type Standing } from './standings';

export const DEFAULT_BOARD_TURNS = 14;
export const MAX_BOARD_TURNS = 40;
/** Chơi thử ở màn luật (GAME_SPEC 5.3): mặc định 2 lượt, tối đa 3. */
export const PRACTICE_TURNS = 2;
export const MAX_PRACTICE_TURNS = 3;
/** Thời lượng pha REVEAL của Bàn Cờ (đáp án + giải thích + đổi chủ ô). */
export const BOARD_REVEAL_MS = 10_000;

export interface BoardMatch {
  /** Bàn cờ hiện tại: đầu lượt khi SELECT/QUESTION, sau khi giải quyết khi REVEAL. */
  board: BoardState;
  /** Lượt hiện tại, bắt đầu từ 1. */
  turn: number;
  totalTurns: number;
  /** Admin bấm "Kết thúc sau lượt này". */
  endAfterThisTurn: boolean;
  stats: MatchStats;
  /** Mục tiêu đã chốt ở SELECT của lượt hiện tại (null khi SELECT chưa đóng). */
  targets: Record<TeamId, CellId | null> | null;
  /** Kết quả lượt vừa giải quyết (chỉ có trong REVEAL). */
  outcome: TurnOutcome | null;
  /** ★ Lòng dân vừa xuất hiện khi bắt đầu lượt hiện tại (null nếu lượt này không có sao mới). */
  newStar: CellId | null;
  /** Phiên chơi thử (GAME_SPEC 5.3): chạy như trận thật nhưng không tính điểm; hết lượt cuối thì bỏ, quay về màn luật. */
  practice: boolean;
}

export function clampTurns(totalTurns: unknown, minimum = 1, maximum = MAX_BOARD_TURNS): number {
  const fallback = maximum === MAX_PRACTICE_TURNS ? PRACTICE_TURNS : DEFAULT_BOARD_TURNS;
  const n = typeof totalTurns === 'number' && Number.isFinite(totalTurns) ? Math.round(totalTurns) : fallback;
  return Math.min(maximum, Math.max(minimum, n));
}

/** Trận mới; `practice` = chơi thử (số lượt 1–3, mặc định 2). */
export function startMatch(
  activeTeamIds: readonly TeamId[],
  totalTurns?: unknown,
  { practice = false }: { practice?: boolean } = {},
): BoardMatch {
  return {
    board: initialBoard(activeTeamIds),
    turn: 1,
    totalTurns: clampTurns(totalTurns, 1, practice ? MAX_PRACTICE_TURNS : MAX_BOARD_TURNS),
    endAfterThisTurn: false,
    stats: emptyStats(),
    targets: null,
    outcome: null,
    newStar: null,
    practice,
  };
}

/** Ghi mục tiêu đã chốt khi SELECT đóng. */
export function withTargets(match: BoardMatch, targets: Record<TeamId, CellId | null>): BoardMatch {
  return { ...match, targets: { ...targets } };
}

/** Câu hỏi của lượt đã đóng → giải quyết lượt, cộng thống kê câu trả lời. */
export function applyTurn(match: BoardMatch, round: QuestionRound): BoardMatch {
  if (round.status !== 'closed') throw new Error('applyTurn: câu hỏi chưa đóng');
  const { board, outcome } = resolveTurn({
    board: match.board,
    targets: match.targets ?? {},
    answers: answersFromRound(round),
  });
  return { ...match, board, outcome, stats: recordAnswers(match.stats, round) };
}

export function isFinalTurn(match: BoardMatch): boolean {
  return match.endAfterThisTurn || match.turn >= match.totalTurns;
}

/** Bối cảnh server cung cấp khi sang lượt mới: nhóm đang chơi và nguồn ngẫu nhiên (đặt ★ Lòng dân). */
export interface TurnContext {
  activeTeamIds: readonly TeamId[];
  rng: Rng;
}

/** Sang lượt kế; lượt chia hết cho 3 thì đặt một ★ Lòng dân mới (GAME_SPEC 3.7). */
export function nextTurn(match: BoardMatch, ctx: TurnContext): BoardMatch {
  const turn = match.turn + 1;
  const star = isStarTurn(turn) ? pickStarCell(match.board, ctx.activeTeamIds, ctx.rng) : null;
  const board = star === null ? match.board : withStar(match.board, star);
  return { ...match, turn, board, targets: null, outcome: null, newStar: star };
}

/** Admin chỉnh số lượt: không nhỏ hơn lượt đang chơi (chơi thử: không quá 3 lượt). */
export function setTotalTurns(match: BoardMatch, totalTurns: unknown): BoardMatch {
  const maximum = match.practice ? Math.max(MAX_PRACTICE_TURNS, match.turn) : MAX_BOARD_TURNS;
  return { ...match, totalTurns: clampTurns(totalTurns, match.turn, maximum) };
}

// ─── Dữ liệu gửi xuống client ────────────────────────────────────────────────

export interface PublicBoardView {
  turn: number;
  totalTurns: number;
  endAfterThisTurn: boolean;
  owners: (TeamId | null)[];
  shields: ShieldGrant[];
  /** Ô có ★ Lòng dân (GAME_SPEC 3.7). */
  stars: CellId[];
  /** ★ vừa xuất hiện khi bắt đầu lượt này (để màn chiếu báo và làm hiệu ứng). */
  newStar: CellId | null;
  standings: Standing[];
  /** Pha SELECT (khi còn mở: không có mục tiêu). */
  select: PublicSelectView | null;
  /** Mục tiêu các nhóm — chỉ sau khi SELECT đóng. */
  targets: Record<TeamId, CellId | null> | null;
  /** Kết quả lượt — chỉ trong REVEAL (sau khi câu hỏi đóng). */
  outcome: TurnOutcome | null;
  /** Đang chơi thử (không tính điểm) — màn hình ghi "Chơi thử". */
  practice: boolean;
}

export function publicBoardView(match: BoardMatch, select: PublicSelectView | null): PublicBoardView {
  return {
    turn: match.turn,
    totalTurns: match.totalTurns,
    endAfterThisTurn: match.endAfterThisTurn,
    owners: [...match.board.owners],
    shields: match.board.shields.map((s) => ({ ...s })),
    stars: [...match.board.stars],
    newStar: match.newStar,
    standings: rankTeams(match.board, match.stats, TEAM_IDS),
    select,
    targets: match.targets && { ...match.targets },
    outcome: match.outcome,
    practice: match.practice,
  };
}

/** Màn SUMMARY trên host: bảng xếp hạng hoặc tổng kết 6 đặc điểm. */
export type SummaryView = 'ranking' | 'lessons';

/** Trạng thái trận công khai (host, admin, người chơi). */
export interface GameView {
  phase: Phase;
  /** Hạn của pha hiện tại (giờ server), để hiện đếm ngược. */
  phaseEndsAt: number | null;
  /** Đang tạm dừng toàn cục từ thời điểm này (giờ server); đồng hồ đứng ở `hạn − pausedAt`. */
  pausedAt: number | null;
  /** Chế độ dự phòng: người dẫn nhập kết quả từ thẻ màu. */
  fallback: boolean;
  summaryView: SummaryView;
  board: PublicBoardView | null;
  /** Quả Bom (từ BOMB_INTRO). KHÔNG có ngòi — chỉ biết bom đang cháy hay dừng. */
  bomb: PublicBombView | null;
}
