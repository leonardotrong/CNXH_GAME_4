/**
 * Pha SELECT của một lượt Bàn Cờ (GAME_SPEC 3.2): mỗi nhóm biểu quyết chọn MỘT ô mục tiêu.
 * Là một vòng biểu quyết (`voteRound.ts`) với phương án = id ô; ô hợp lệ tính trên bàn cờ đầu lượt.
 * Nhóm không có ô hợp lệ nào không tham gia vòng (bỏ lượt chọn).
 */
import { CELL_COUNT, validTargets, type BoardState, type CellId } from './board';
import type { TeamId } from './lobby';
import {
  castBallot,
  closeVotes,
  lockBallots,
  lockedOrder,
  openVoteRound,
  teamVoteView,
  type TeamContext,
  type TeamVoteView,
  type VoteResult,
  type VoteRound,
} from './voteRound';

/** Thời lượng pha SELECT. */
export const SELECT_DURATION_MS = 15_000;

export interface SelectRound extends VoteRound {
  /** Ô hợp lệ của từng nhóm tham gia (sắp theo id). */
  validTargets: Record<TeamId, CellId[]>;
}

export function openSelectRound(args: {
  roundId: number;
  board: BoardState;
  teamIds: readonly TeamId[];
  now: number;
  durationMs: number;
}): SelectRound {
  const targets: Record<TeamId, CellId[]> = {};
  for (const t of args.teamIds) {
    const cells = validTargets(args.board, t);
    if (cells.length > 0) targets[t] = cells;
  }
  const teamIds = args.teamIds.filter((t) => targets[t] !== undefined);
  return { ...openVoteRound({ ...args, teamIds }), validTargets: targets };
}

export function castTarget(
  round: SelectRound,
  teamId: TeamId,
  playerId: string,
  cellId: number,
  now: number,
  ctx?: TeamContext,
): VoteResult<SelectRound> {
  return castBallot(round, teamId, playerId, cellId, now, (c) => round.validTargets[teamId]?.includes(c) ?? false, ctx);
}

export function lockTarget(
  round: SelectRound,
  teamId: TeamId,
  playerId: string,
  ctx: TeamContext,
  now: number,
): VoteResult<SelectRound> {
  return lockBallots(round, teamId, playerId, ctx, now);
}

export function closeSelectRound(
  round: SelectRound,
  contexts: Readonly<Record<TeamId, TeamContext>>,
  now: number,
): SelectRound {
  return closeVotes(round, contexts, now);
}

/** Mục tiêu đã chốt của các nhóm tham gia (null = bỏ lượt). Vòng còn mở → rỗng. */
export function selectedTargets(round: SelectRound): Record<TeamId, CellId | null> {
  if (round.status !== 'closed') return {};
  return Object.fromEntries(round.teamIds.map((t) => [t, round.teams[t]!.choice]));
}

// ─── Dữ liệu gửi xuống client ────────────────────────────────────────────────

/** Trạng thái SELECT công khai. Khi còn mở: KHÔNG có mục tiêu của nhóm nào (lật cùng lúc khi đóng). */
export interface PublicSelectView {
  roundId: number;
  startedAt: number;
  endsAt: number;
  status: VoteRound['status'];
  /** Nhóm tham gia chọn ô (có ít nhất một ô hợp lệ). */
  teamIds: TeamId[];
  /** Nhóm đã chốt (không lộ lựa chọn). */
  locked: TeamId[];
  targets: Record<TeamId, CellId | null> | null;
}

export function publicSelectView(round: SelectRound): PublicSelectView {
  return {
    roundId: round.roundId,
    startedAt: round.startedAt,
    endsAt: round.endsAt,
    status: round.status,
    teamIds: [...round.teamIds],
    locked: lockedOrder(round).map(({ teamId }) => teamId),
    targets: round.status === 'closed' ? selectedTargets(round) : null,
  };
}

/** Phiếu chọn ô của MỘT nhóm (`tally` theo id ô), chỉ gửi cho thành viên nhóm đó. */
export interface TeamSelectView extends TeamVoteView {
  validTargets: CellId[];
}

export function teamSelectView(round: SelectRound, teamId: TeamId, ctx: TeamContext): TeamSelectView | null {
  const view = teamVoteView(round, teamId, ctx, CELL_COUNT);
  return view && { ...view, validTargets: [...round.validTargets[teamId]!] };
}
