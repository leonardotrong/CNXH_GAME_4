/**
 * Máy trạng thái của MỘT câu hỏi (GAME_SPEC 2.2–2.4) — một vòng biểu quyết (`voteRound.ts`)
 * với phương án = chỉ số đáp án. Hàm thuần: nhận trạng thái, trả trạng thái mới.
 *
 *   OPEN ──(mọi nhóm có người đã chốt | hết giờ: tự chốt nhóm còn lại)──▶ CLOSED
 *
 * - OPEN: nhận phiếu (đổi ý được cho tới khi nhóm chốt) và lệnh CHỐT của đội trưởng hiệu lực
 *   (chỉ khi quá nửa thành viên online đã bỏ phiếu). `lockedAt` = giờ server nhận lệnh.
 * - CLOSED: có kết quả; lúc này mới được gửi đáp án, giải thích và lựa chọn của các nhóm.
 */
import type { TeamId } from './lobby';
import type { PresentedQuestion } from './questions';
import {
  castBallot,
  closeVotes,
  lockBallots,
  lockedOrder,
  openVoteRound,
  teamVoteView,
  type LockSource,
  type TeamContext,
  type TeamVoteView,
  type VoteResult,
  type VoteRound,
} from './voteRound';

export interface QuestionRound extends VoteRound {
  question: PresentedQuestion;
}

export type RoundResult = VoteResult<QuestionRound>;

export function openRound(args: {
  roundId: number;
  question: PresentedQuestion;
  teamIds: readonly TeamId[];
  now: number;
  durationMs: number;
}): QuestionRound {
  return { ...openVoteRound(args), question: args.question };
}

export function castVote(
  round: QuestionRound,
  teamId: TeamId,
  playerId: string,
  option: number,
  now: number,
): RoundResult {
  return castBallot(round, teamId, playerId, option, now, (o) => o >= 0 && o < round.question.options.length);
}

export function lockTeam(
  round: QuestionRound,
  teamId: TeamId,
  playerId: string,
  ctx: TeamContext,
  now: number,
): RoundResult {
  return lockBallots(round, teamId, playerId, ctx, now);
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
  return closeVotes(round, contexts, now);
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
  status: VoteRound['status'];
  teamIds: TeamId[];
  /** Nhóm đã chốt (chỉ thứ tự và thời điểm, không lộ lựa chọn). */
  locked: { teamId: TeamId; lockedAfterMs: number }[];
  reveal: QuestionReveal | null;
}

/** Phiếu của MỘT nhóm cho câu hỏi, chỉ gửi cho thành viên nhóm đó. */
export type TeamQuestionView = TeamVoteView;

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
  return teamVoteView(round, teamId, ctx, round.question.options.length);
}
