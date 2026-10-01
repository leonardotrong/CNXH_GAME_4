import { describe, expect, it } from 'vitest';
import { mk } from './boardFixtures';
import { castVote, closeRound, lockTeam, openRound } from './questionRound';
import type { TeamContext } from './voteRound';
import type { PresentedQuestion } from './questions';
import { answersFromRound, emptyStats, rankTeams, recordAnswers } from './standings';

const question: PresentedQuestion = {
  questionId: 'q', pool: 'board', prompt: '?', options: ['a', 'b', 'c', 'd'], answerIndex: 2, explanation: 'e',
};
const ctx = (id: string): TeamContext => ({ memberIds: [id], onlineIds: [id], captainId: id });

/** Câu hỏi mở lúc 1000, dài 20 s: nhóm 1 chốt đúng lúc 4000, nhóm 2 chốt sai lúc 2000,
 *  nhóm 3 bỏ phiếu đúng nhưng không chốt (tự chốt lúc hết giờ 21000), nhóm 4 không bỏ phiếu. */
function playedRound() {
  let r = openRound({ roundId: 1, question, teamIds: [1, 2, 3, 4], now: 1000, durationMs: 20_000 });
  const step = (res: ReturnType<typeof castVote>) => {
    if (!res.ok) throw new Error(res.error);
    r = res.round;
  };
  step(castVote(r, 2, 'b', 0, 1500));
  step(lockTeam(r, 2, 'b', ctx('b'), 2000));
  step(castVote(r, 1, 'a', 2, 3000));
  step(lockTeam(r, 1, 'a', ctx('a'), 4000));
  step(castVote(r, 3, 'c', 2, 5000));
  return closeRound(r, { 1: ctx('a'), 2: ctx('b'), 3: ctx('c'), 4: ctx('d') }, 30_000);
}

describe('answersFromRound', () => {
  it('đúng/sai và thời điểm chốt (tự chốt khi hết giờ = endsAt)', () => {
    expect(answersFromRound(playedRound())).toEqual({
      1: { correct: true, lockedAt: 4000 },
      2: { correct: false, lockedAt: 2000 },
      3: { correct: true, lockedAt: 21_000 },
      4: { correct: false, lockedAt: 21_000 },
    });
  });

  it('câu còn mở → không có kết quả (không lộ đáp án)', () => {
    const r = openRound({ roundId: 1, question, teamIds: [1], now: 0, durationMs: 1000 });
    expect(answersFromRound(r)).toEqual({});
  });
});

describe('recordAnswers', () => {
  it('cộng số câu đúng và thời gian chốt (tính từ lúc câu mở) chỉ cho câu đúng', () => {
    const stats = recordAnswers(emptyStats(), playedRound());
    expect(stats[1]).toEqual({ correct: 1, correctLockMs: 3000 });
    expect(stats[2]).toEqual({ correct: 0, correctLockMs: 0 });
    expect(stats[3]).toEqual({ correct: 1, correctLockMs: 20_000 });
    expect(stats[4]).toEqual({ correct: 0, correctLockMs: 0 });
    const twice = recordAnswers(stats, playedRound());
    expect(twice[1]).toEqual({ correct: 2, correctLockMs: 6000 });
    expect(stats[1]).toEqual({ correct: 1, correctLockMs: 3000 }); // không sửa đầu vào
  });

  it('câu còn mở → không đổi', () => {
    const r = openRound({ roundId: 1, question, teamIds: [1], now: 0, durationMs: 1000 });
    expect(recordAnswers(emptyStats(), r)).toEqual(emptyStats());
  });
});

describe('rankTeams (3.6)', () => {
  it('xếp theo điểm (ô Hiến pháp = 3) giảm dần', () => {
    const board = mk([[0, 0, 2], [0, -1, 1], [1, -1, 1], [-1, 0, 3]]);
    const s = rankTeams(board, emptyStats(), [1, 2, 3, 4]);
    expect(s.map((x) => [x.teamId, x.score, x.cells, x.rank])).toEqual([
      [2, 3, 1, 1],
      [1, 2, 2, 2],
      [3, 1, 1, 3],
      [4, 0, 0, 4],
    ]);
  });

  it('hòa điểm → nhiều câu đúng hơn xếp trên; tiếp tục hòa → tổng thời gian chốt câu đúng ít hơn xếp trên', () => {
    const board = mk([[0, -1, 1], [1, -1, 2], [-1, 0, 3]]);
    const stats = {
      ...emptyStats(),
      1: { correct: 3, correctLockMs: 30_000 },
      2: { correct: 4, correctLockMs: 50_000 },
      3: { correct: 3, correctLockMs: 20_000 },
    };
    expect(rankTeams(board, stats, [1, 2, 3]).map((x) => [x.teamId, x.rank])).toEqual([
      [2, 1],
      [3, 2],
      [1, 3],
    ]);
  });

  it('bằng nhau cả ba tiêu chí → đồng hạng (1, 2, 2), thứ tự hiển thị theo số nhóm', () => {
    const board = mk([[0, -1, 1], [1, -1, 2], [-1, 0, 3], [-1, -1, 3]]);
    const stats = { ...emptyStats(), 1: { correct: 1, correctLockMs: 5 }, 2: { correct: 1, correctLockMs: 5 } };
    expect(rankTeams(board, stats, [2, 1, 3]).map((x) => [x.teamId, x.rank])).toEqual([
      [3, 1],
      [1, 2],
      [2, 2],
    ]);
  });
});
