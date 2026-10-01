/**
 * Thống kê câu trả lời và xếp hạng (GAME_SPEC 3.6). Hàm thuần.
 */
import { cellsOf, scoreOf, type BoardState } from './board';
import { TEAM_IDS, type TeamId } from './lobby';
import type { QuestionRound } from './questionRound';
import type { TeamAnswer } from './resolveTurn';

export interface TeamStats {
  /** Tổng số câu đúng cả trận. */
  correct: number;
  /** Tổng thời gian chốt (ms, từ lúc câu mở) của các câu đúng. */
  correctLockMs: number;
}

export type MatchStats = Record<TeamId, TeamStats>;

export function emptyStats(teamIds: readonly TeamId[] = TEAM_IDS): MatchStats {
  return Object.fromEntries(teamIds.map((t) => [t, { correct: 0, correctLockMs: 0 }]));
}

/** Kết quả từng nhóm của một câu hỏi ĐÃ ĐÓNG (câu còn mở → rỗng, không lộ đáp án). */
export function answersFromRound(round: QuestionRound): Record<TeamId, TeamAnswer> {
  if (round.status !== 'closed') return {};
  return Object.fromEntries(
    round.teamIds.map((t) => {
      const team = round.teams[t]!;
      return [t, { correct: team.choice !== null && team.choice === round.question.answerIndex, lockedAt: team.lockedAt! }];
    }),
  );
}

export function recordAnswers(stats: MatchStats, round: QuestionRound): MatchStats {
  const next: MatchStats = { ...stats };
  for (const [key, answer] of Object.entries(answersFromRound(round))) {
    if (!answer.correct) continue;
    const t = Number(key);
    const prev = next[t] ?? { correct: 0, correctLockMs: 0 };
    next[t] = { correct: prev.correct + 1, correctLockMs: prev.correctLockMs + (answer.lockedAt - round.startedAt) };
  }
  return next;
}

export interface Standing extends TeamStats {
  teamId: TeamId;
  score: number;
  cells: number;
  /** Hạng (đồng hạng khi bằng nhau cả điểm, số câu đúng, thời gian chốt). */
  rank: number;
}

/** Điểm giảm dần → số câu đúng giảm dần → tổng thời gian chốt câu đúng tăng dần; hiển thị hòa theo số nhóm. */
export function rankTeams(board: BoardState, stats: MatchStats, teamIds: readonly TeamId[] = TEAM_IDS): Standing[] {
  const rows = teamIds.map((teamId) => ({
    teamId,
    score: scoreOf(board, teamId),
    cells: cellsOf(board, teamId).length,
    correct: stats[teamId]?.correct ?? 0,
    correctLockMs: stats[teamId]?.correctLockMs ?? 0,
  }));
  const compare = (a: (typeof rows)[number], b: (typeof rows)[number]) =>
    b.score - a.score || b.correct - a.correct || a.correctLockMs - b.correctLockMs;
  rows.sort((a, b) => compare(a, b) || a.teamId - b.teamId);
  const out: Standing[] = [];
  rows.forEach((row, i) => {
    const prev = out[i - 1];
    out.push({ ...row, rank: prev && compare(prev, row) === 0 ? prev.rank : i + 1 });
  });
  return out;
}
