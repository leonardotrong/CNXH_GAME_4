/**
 * Tiến trình trận Bàn Cờ Quyền Lực qua các lượt (GAME_SPEC 3.2, 3.6). Hàm thuần.
 * Server chỉ điều phối pha và timer: SELECT → QUESTION → REVEAL → lượt kế / kết thúc.
 */
import type { BoardState, CellId, ShieldGrant } from './board';
import { initialBoard } from './board';
import { TEAM_IDS, type TeamId } from './lobby';
import type { Phase } from './phases';
import type { QuestionRound } from './questionRound';
import { resolveTurn, type TurnOutcome } from './resolveTurn';
import type { PublicSelectView } from './selectRound';
import { answersFromRound, emptyStats, rankTeams, recordAnswers, type MatchStats, type Standing } from './standings';

export const DEFAULT_BOARD_TURNS = 14;
export const MAX_BOARD_TURNS = 40;
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
}

export function clampTurns(totalTurns: unknown, minimum = 1): number {
  const n = typeof totalTurns === 'number' && Number.isFinite(totalTurns) ? Math.round(totalTurns) : DEFAULT_BOARD_TURNS;
  return Math.min(MAX_BOARD_TURNS, Math.max(minimum, n));
}

export function startMatch(activeTeamIds: readonly TeamId[], totalTurns: unknown = DEFAULT_BOARD_TURNS): BoardMatch {
  return {
    board: initialBoard(activeTeamIds),
    turn: 1,
    totalTurns: clampTurns(totalTurns),
    endAfterThisTurn: false,
    stats: emptyStats(),
    targets: null,
    outcome: null,
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

export function nextTurn(match: BoardMatch): BoardMatch {
  return { ...match, turn: match.turn + 1, targets: null, outcome: null };
}

/** Admin chỉnh số lượt: không nhỏ hơn lượt đang chơi. */
export function setTotalTurns(match: BoardMatch, totalTurns: unknown): BoardMatch {
  return { ...match, totalTurns: clampTurns(totalTurns, match.turn) };
}

// ─── Dữ liệu gửi xuống client ────────────────────────────────────────────────

export interface PublicBoardView {
  turn: number;
  totalTurns: number;
  endAfterThisTurn: boolean;
  owners: (TeamId | null)[];
  shields: ShieldGrant[];
  standings: Standing[];
  /** Pha SELECT (khi còn mở: không có mục tiêu). */
  select: PublicSelectView | null;
  /** Mục tiêu các nhóm — chỉ sau khi SELECT đóng. */
  targets: Record<TeamId, CellId | null> | null;
  /** Kết quả lượt — chỉ trong REVEAL (sau khi câu hỏi đóng). */
  outcome: TurnOutcome | null;
}

export function publicBoardView(match: BoardMatch, select: PublicSelectView | null): PublicBoardView {
  return {
    turn: match.turn,
    totalTurns: match.totalTurns,
    endAfterThisTurn: match.endAfterThisTurn,
    owners: [...match.board.owners],
    shields: match.board.shields.map((s) => ({ ...s })),
    standings: rankTeams(match.board, match.stats, TEAM_IDS),
    select,
    targets: match.targets && { ...match.targets },
    outcome: match.outcome,
  };
}

/** Trạng thái trận công khai (host, admin, người chơi). */
export interface GameView {
  phase: Phase;
  /** Hạn của pha hiện tại (giờ server), để hiện đếm ngược. */
  phaseEndsAt: number | null;
  board: PublicBoardView | null;
}
