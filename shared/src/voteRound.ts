/**
 * Một vòng biểu quyết nhóm có hạn giờ (GAME_SPEC 2.2) — dùng chung cho câu hỏi, chọn ô (SELECT)
 * và chọn nhóm nhận bom. Hàm thuần: nhận trạng thái, trả trạng thái mới.
 *
 *   OPEN ──(mọi nhóm có người đã chốt | hết giờ: tự chốt nhóm còn lại)──▶ CLOSED
 *
 * "Phương án" là số nguyên; mỗi loại vòng tự quy định phương án nào hợp lệ (`isValid`).
 */
import type { TeamId } from './lobby';
import { canLock, resolveTeamChoice, tallyVotes, type Ballot } from './voting';

export type LockSource = 'captain' | 'timeout';

export interface TeamRound {
  ballots: Record<string, Ballot>;
  lockedAt: number | null;
  lockedBy: LockSource | null;
  choice: number | null;
}

export interface VoteRound {
  roundId: number;
  teamIds: TeamId[];
  startedAt: number;
  endsAt: number;
  status: 'open' | 'closed';
  teams: Record<TeamId, TeamRound>;
}

/** Thông tin nhóm tại thời điểm xử lý (do server cung cấp từ phòng chơi). */
export interface TeamContext {
  memberIds: readonly string[];
  onlineIds: readonly string[];
  /** Đội trưởng hiệu lực (đã tính chuyển quyền tạm thời). */
  captainId: string | null;
}

export type RoundError = 'CLOSED' | 'NOT_IN_ROUND' | 'LOCKED' | 'BAD_OPTION' | 'NOT_CAPTAIN' | 'NOT_ENOUGH_VOTES';
export type VoteResult<R extends VoteRound> = { ok: true; round: R } | { ok: false; error: RoundError };

export function openVoteRound(args: {
  roundId: number;
  teamIds: readonly TeamId[];
  now: number;
  durationMs: number;
}): VoteRound {
  const teams: Record<TeamId, TeamRound> = {};
  for (const id of args.teamIds) teams[id] = { ballots: {}, lockedAt: null, lockedBy: null, choice: null };
  return {
    roundId: args.roundId,
    teamIds: [...args.teamIds],
    startedAt: args.now,
    endsAt: args.now + args.durationMs,
    status: 'open',
    teams,
  };
}

/** Phiếu hợp lệ của nhóm = phiếu của người hiện còn trong nhóm. */
export function teamBallots(team: TeamRound, ctx: Pick<TeamContext, 'memberIds'>): Ballot[] {
  const members = new Set(ctx.memberIds);
  return Object.values(team.ballots).filter((b) => members.has(b.playerId));
}

function withTeam<R extends VoteRound>(round: R, teamId: TeamId, team: TeamRound): R {
  return { ...round, teams: { ...round.teams, [teamId]: team } };
}

export function castBallot<R extends VoteRound>(
  round: R,
  teamId: TeamId,
  playerId: string,
  option: number,
  now: number,
  isValid: (option: number) => boolean,
): VoteResult<R> {
  if (round.status !== 'open' || now > round.endsAt) return { ok: false, error: 'CLOSED' };
  const team = round.teams[teamId];
  if (!team) return { ok: false, error: 'NOT_IN_ROUND' };
  if (team.lockedAt !== null) return { ok: false, error: 'LOCKED' };
  if (!Number.isInteger(option) || !isValid(option)) return { ok: false, error: 'BAD_OPTION' };
  if (team.ballots[playerId]?.option === option) return { ok: true, round };
  const ballots = { ...team.ballots, [playerId]: { playerId, option, castAt: now } };
  return { ok: true, round: withTeam(round, teamId, { ...team, ballots }) };
}

/** Lệnh CHỐT của đội trưởng: chỉ khi quá nửa thành viên online đã bỏ phiếu. `lockedAt` = giờ server nhận lệnh. */
export function lockBallots<R extends VoteRound>(
  round: R,
  teamId: TeamId,
  playerId: string,
  ctx: TeamContext,
  now: number,
): VoteResult<R> {
  if (round.status !== 'open' || now > round.endsAt) return { ok: false, error: 'CLOSED' };
  const team = round.teams[teamId];
  if (!team) return { ok: false, error: 'NOT_IN_ROUND' };
  if (team.lockedAt !== null) return { ok: false, error: 'LOCKED' };
  if (ctx.captainId !== playerId) return { ok: false, error: 'NOT_CAPTAIN' };
  const ballots = teamBallots(team, ctx);
  if (!canLock(ctx.onlineIds, ballots)) return { ok: false, error: 'NOT_ENOUGH_VOTES' };
  const choice = resolveTeamChoice(ballots, ctx.captainId);
  return { ok: true, round: withTeam(round, teamId, { ...team, lockedAt: now, lockedBy: 'captain', choice }) };
}

/** Mọi nhóm có ít nhất một thành viên đều đã chốt → đóng sớm được. */
export function allTeamsLocked(round: VoteRound, contexts: Readonly<Record<TeamId, TeamContext>>): boolean {
  return round.teamIds.every((id) => (contexts[id]?.memberIds.length ?? 0) === 0 || round.teams[id]!.lockedAt !== null);
}

/**
 * Đóng vòng. Nhóm chưa chốt: server tự chốt theo quy tắc biểu quyết (không cần quá nửa),
 * thời điểm chốt = `min(now, endsAt)`. Không có phiếu → không có lựa chọn.
 */
export function closeVotes<R extends VoteRound>(
  round: R,
  contexts: Readonly<Record<TeamId, TeamContext>>,
  now: number,
): R {
  if (round.status === 'closed') return round;
  const closedAt = Math.min(now, round.endsAt);
  const teams: Record<TeamId, TeamRound> = { ...round.teams };
  for (const id of round.teamIds) {
    const team = teams[id]!;
    if (team.lockedAt !== null) continue;
    const ctx = contexts[id] ?? { memberIds: [], onlineIds: [], captainId: null };
    teams[id] = {
      ...team,
      lockedAt: closedAt,
      lockedBy: 'timeout',
      choice: resolveTeamChoice(teamBallots(team, ctx), ctx.captainId),
    };
  }
  return { ...round, status: 'closed', teams };
}

/** Các nhóm đã chốt, sắp theo thời điểm chốt (sớm → muộn), hòa thì theo số nhóm. */
export function lockedOrder(round: VoteRound): { teamId: TeamId; team: TeamRound }[] {
  return round.teamIds
    .map((teamId) => ({ teamId, team: round.teams[teamId]! }))
    .filter(({ team }) => team.lockedAt !== null)
    .sort((a, b) => a.team.lockedAt! - b.team.lockedAt! || a.teamId - b.teamId);
}

/** Trạng thái biểu quyết của MỘT nhóm, chỉ gửi cho thành viên nhóm đó. */
export interface TeamVoteView {
  roundId: number;
  teamId: TeamId;
  /** Số phiếu theo phương án (chỉ số = phương án). */
  tally: number[];
  /** playerId → phương án (minh bạch trong nhóm; giúp người vào lại khôi phục lựa chọn). */
  votes: Record<string, number>;
  onlineCount: number;
  votedOnlineCount: number;
  canLock: boolean;
  captainId: string | null;
  locked: boolean;
  /** Lựa chọn nhóm đã chốt (chỉ nhóm mình thấy). */
  choice: number | null;
}

export function teamVoteView(round: VoteRound, teamId: TeamId, ctx: TeamContext, optionCount: number): TeamVoteView | null {
  const team = round.teams[teamId];
  if (!team) return null;
  const ballots = teamBallots(team, ctx);
  const voters = new Set(ballots.map((b) => b.playerId));
  return {
    roundId: round.roundId,
    teamId,
    tally: tallyVotes(ballots, optionCount),
    votes: Object.fromEntries(ballots.map((b) => [b.playerId, b.option])),
    onlineCount: ctx.onlineIds.length,
    votedOnlineCount: ctx.onlineIds.filter((id) => voters.has(id)).length,
    canLock: round.status === 'open' && team.lockedAt === null && canLock(ctx.onlineIds, ballots),
    captainId: ctx.captainId,
    locked: team.lockedAt !== null,
    choice: team.lockedAt !== null ? team.choice : null,
  };
}
