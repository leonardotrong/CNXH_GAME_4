/**
 * Máy trạng thái của MỘT câu hỏi (GAME_SPEC 2.2–2.4). Hàm thuần: nhận trạng thái, trả trạng thái mới.
 *
 *   OPEN ──(mọi nhóm có người đã chốt | hết giờ: tự chốt nhóm còn lại)──▶ CLOSED
 *
 * - OPEN: nhận phiếu (đổi ý được cho tới khi nhóm chốt) và lệnh CHỐT của đội trưởng hiệu lực
 *   (chỉ khi quá nửa thành viên online đã bỏ phiếu). `lockedAt` = giờ server nhận lệnh.
 * - CLOSED: có kết quả; lúc này mới được gửi đáp án, giải thích và lựa chọn của các nhóm.
 */
import type { TeamId } from './lobby';
import type { PresentedQuestion } from './questions';
import { canLock, resolveTeamChoice, tallyVotes, type Ballot } from './voting';

export type LockSource = 'captain' | 'timeout';

export interface TeamRound {
  ballots: Record<string, Ballot>;
  lockedAt: number | null;
  lockedBy: LockSource | null;
  choice: number | null;
}

export interface QuestionRound {
  roundId: number;
  question: PresentedQuestion;
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
export type RoundResult = { ok: true; round: QuestionRound } | { ok: false; error: RoundError };

export function openRound(args: {
  roundId: number;
  question: PresentedQuestion;
  teamIds: readonly TeamId[];
  now: number;
  durationMs: number;
}): QuestionRound {
  const teams: Record<TeamId, TeamRound> = {};
  for (const id of args.teamIds) teams[id] = { ballots: {}, lockedAt: null, lockedBy: null, choice: null };
  return {
    roundId: args.roundId,
    question: args.question,
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

function withTeam(round: QuestionRound, teamId: TeamId, team: TeamRound): QuestionRound {
  return { ...round, teams: { ...round.teams, [teamId]: team } };
}

export function castVote(
  round: QuestionRound,
  teamId: TeamId,
  playerId: string,
  option: number,
  now: number,
): RoundResult {
  if (round.status !== 'open' || now > round.endsAt) return { ok: false, error: 'CLOSED' };
  const team = round.teams[teamId];
  if (!team) return { ok: false, error: 'NOT_IN_ROUND' };
  if (team.lockedAt !== null) return { ok: false, error: 'LOCKED' };
  if (!Number.isInteger(option) || option < 0 || option >= round.question.options.length)
    return { ok: false, error: 'BAD_OPTION' };
  if (team.ballots[playerId]?.option === option) return { ok: true, round };
  const ballots = { ...team.ballots, [playerId]: { playerId, option, castAt: now } };
  return { ok: true, round: withTeam(round, teamId, { ...team, ballots }) };
}

export function lockTeam(
  round: QuestionRound,
  teamId: TeamId,
  playerId: string,
  ctx: TeamContext,
  now: number,
): RoundResult {
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
export function allTeamsLocked(round: QuestionRound, contexts: Readonly<Record<TeamId, TeamContext>>): boolean {
  return round.teamIds.every((id) => (contexts[id]?.memberIds.length ?? 0) === 0 || round.teams[id]!.lockedAt !== null);
}

/**
 * Đóng câu hỏi. Nhóm chưa chốt: server tự chốt theo quy tắc biểu quyết (không cần quá nửa),
 * thời điểm chốt = `min(now, endsAt)`. Không có phiếu → không có lựa chọn.
 */
export function closeRound(
  round: QuestionRound,
  contexts: Readonly<Record<TeamId, TeamContext>>,
  now: number,
): QuestionRound {
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

// ─── Dữ liệu gửi xuống client ────────────────────────────────────────────────

export interface TeamResult {
  teamId: TeamId;
  choice: number | null;
  correct: boolean;
  /** ms kể từ khi câu hỏi mở tới lúc server ghi nhận chốt. */
  lockedAfterMs: number;
  lockedBy: LockSource;
}

export interface QuestionReveal {
  answerIndex: number;
  explanation: string;
  /** Sắp theo thứ tự chốt (sớm → muộn). */
  results: TeamResult[];
}

/** Trạng thái câu hỏi cho host/mọi người. Khi còn mở: KHÔNG có đáp án, giải thích, lựa chọn của nhóm. */
export interface PublicQuestionView {
  roundId: number;
  pool: PresentedQuestion['pool'];
  prompt: string;
  options: string[];
  startedAt: number;
  endsAt: number;
  status: QuestionRound['status'];
  teamIds: TeamId[];
  /** Nhóm đã chốt (chỉ thứ tự và thời điểm, không lộ lựa chọn). */
  locked: { teamId: TeamId; lockedAfterMs: number }[];
  reveal: QuestionReveal | null;
}

/** Trạng thái biểu quyết của MỘT nhóm, chỉ gửi cho thành viên nhóm đó. */
export interface TeamQuestionView {
  roundId: number;
  teamId: TeamId;
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

function lockedOrder(round: QuestionRound) {
  return round.teamIds
    .map((teamId) => ({ teamId, team: round.teams[teamId]! }))
    .filter(({ team }) => team.lockedAt !== null)
    .sort((a, b) => a.team.lockedAt! - b.team.lockedAt! || a.teamId - b.teamId);
}

export function publicQuestionView(round: QuestionRound): PublicQuestionView {
  const order = lockedOrder(round);
  const { question } = round;
  return {
    roundId: round.roundId,
    pool: question.pool,
    prompt: question.prompt,
    options: [...question.options],
    startedAt: round.startedAt,
    endsAt: round.endsAt,
    status: round.status,
    teamIds: [...round.teamIds],
    locked: order.map(({ teamId, team }) => ({ teamId, lockedAfterMs: team.lockedAt! - round.startedAt })),
    reveal:
      round.status === 'closed'
        ? {
            answerIndex: question.answerIndex,
            explanation: question.explanation,
            results: order.map(({ teamId, team }) => ({
              teamId,
              choice: team.choice,
              correct: team.choice === question.answerIndex,
              lockedAfterMs: team.lockedAt! - round.startedAt,
              lockedBy: team.lockedBy!,
            })),
          }
        : null,
  };
}

export function teamQuestionView(round: QuestionRound, teamId: TeamId, ctx: TeamContext): TeamQuestionView | null {
  const team = round.teams[teamId];
  if (!team) return null;
  const ballots = teamBallots(team, ctx);
  const voters = new Set(ballots.map((b) => b.playerId));
  return {
    roundId: round.roundId,
    teamId,
    tally: tallyVotes(ballots, round.question.options.length),
    votes: Object.fromEntries(ballots.map((b) => [b.playerId, b.option])),
    onlineCount: ctx.onlineIds.length,
    votedOnlineCount: ctx.onlineIds.filter((id) => voters.has(id)).length,
    canLock: round.status === 'open' && team.lockedAt === null && canLock(ctx.onlineIds, ballots),
    captainId: ctx.captainId,
    locked: team.lockedAt !== null,
    choice: team.lockedAt !== null ? team.choice : null,
  };
}
