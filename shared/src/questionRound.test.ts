import { describe, expect, it } from 'vitest';
import type { PresentedQuestion } from './questions';
import {
  allTeamsLocked,
  castVote,
  closeRound,
  lockTeam,
  openRound,
  publicQuestionView,
  teamQuestionView,
  type QuestionRound,
  type RoundResult,
  type TeamContext,
} from './questionRound';

const question: PresentedQuestion = {
  questionId: 'q1', pool: 'board', prompt: 'Câu?',
  options: ['A', 'B', 'C', 'D'], answerIndex: 2, explanation: 'Giải thích bí mật',
};
const ctx1: TeamContext = { memberIds: ['a', 'b', 'c'], onlineIds: ['a', 'b', 'c'], captainId: 'a' };
const ctx2: TeamContext = { memberIds: ['x', 'y'], onlineIds: ['x', 'y'], captainId: 'x' };
const empty: TeamContext = { memberIds: [], onlineIds: [], captainId: null };
const contexts = { 1: ctx1, 2: ctx2, 3: empty };

const ok = (r: RoundResult): QuestionRound => {
  if (!r.ok) throw new Error(r.error);
  return r.round;
};
const start = () => openRound({ roundId: 1, question, teamIds: [1, 2, 3], now: 1000, durationMs: 20_000 });

/** Tìm đệ quy các khóa/giá trị bí mật trong payload. */
function leaks(payload: unknown): boolean {
  const json = JSON.stringify(payload);
  return /answerIndex|explanation|"correct"|"choice":\d/.test(json) || json.includes('Giải thích bí mật');
}

describe('máy trạng thái câu hỏi', () => {
  it('mở: thời hạn = bắt đầu + thời lượng', () => {
    const r = start();
    expect(r.status).toBe('open');
    expect(r.endsAt).toBe(21_000);
  });

  it('bỏ phiếu, đổi ý được; thời điểm phiếu = lần đổi gần nhất', () => {
    let r = ok(castVote(start(), 1, 'a', 0, 2000));
    r = ok(castVote(r, 1, 'a', 3, 2500));
    expect(r.teams[1]!.ballots['a']).toEqual({ playerId: 'a', option: 3, castAt: 2500 });
  });

  it('từ chối phiếu sai phương án, nhóm không tham gia, sau hạn', () => {
    const r = start();
    expect(castVote(r, 1, 'a', 4, 2000)).toEqual({ ok: false, error: 'BAD_OPTION' });
    expect(castVote(r, 5, 'a', 0, 2000)).toEqual({ ok: false, error: 'NOT_IN_ROUND' });
    expect(castVote(r, 1, 'a', 0, 21_001)).toEqual({ ok: false, error: 'CLOSED' });
  });

  it('CHỐT chỉ bởi đội trưởng hiệu lực và khi quá nửa online đã bầu', () => {
    let r = ok(castVote(start(), 1, 'a', 1, 2000));
    expect(lockTeam(r, 1, 'a', ctx1, 3000)).toEqual({ ok: false, error: 'NOT_ENOUGH_VOTES' });
    r = ok(castVote(r, 1, 'b', 2, 2100));
    expect(lockTeam(r, 1, 'b', ctx1, 3000)).toEqual({ ok: false, error: 'NOT_CAPTAIN' });
    r = ok(lockTeam(r, 1, 'a', ctx1, 3000));
    // hòa 1–1 → theo phiếu đội trưởng
    expect(r.teams[1]).toMatchObject({ lockedAt: 3000, lockedBy: 'captain', choice: 1 });
  });

  it('sau khi chốt không đổi phiếu, không chốt lại', () => {
    let r = ok(castVote(start(), 2, 'x', 0, 2000));
    r = ok(castVote(r, 2, 'y', 0, 2000));
    r = ok(lockTeam(r, 2, 'x', ctx2, 2500));
    expect(castVote(r, 2, 'y', 1, 2600)).toEqual({ ok: false, error: 'LOCKED' });
    expect(lockTeam(r, 2, 'x', ctx2, 2600)).toEqual({ ok: false, error: 'LOCKED' });
  });

  it('phiếu của người đã rời nhóm không tính', () => {
    let r = ok(castVote(start(), 2, 'gone', 3, 1500));
    r = ok(castVote(r, 2, 'x', 1, 2000));
    r = closeRound(r, contexts, 30_000);
    expect(r.teams[2]!.choice).toBe(1);
  });

  it('đóng sớm khi mọi nhóm có người đã chốt (bỏ qua nhóm rỗng)', () => {
    let r = start();
    r = ok(castVote(r, 1, 'a', 2, 1100));
    r = ok(castVote(r, 1, 'b', 2, 1200));
    r = ok(lockTeam(r, 1, 'a', ctx1, 1300));
    expect(allTeamsLocked(r, contexts)).toBe(false);
    r = ok(castVote(r, 2, 'x', 0, 1400));
    r = ok(castVote(r, 2, 'y', 0, 1400));
    r = ok(lockTeam(r, 2, 'x', ctx2, 1500));
    expect(allTeamsLocked(r, contexts)).toBe(true);
  });

  it('hết giờ: tự chốt không cần quá nửa, thời điểm = hết giờ; không phiếu → không có lựa chọn', () => {
    let r = ok(castVote(start(), 1, 'b', 2, 5000)); // 1/3 < quá nửa
    r = closeRound(r, contexts, 21_050);
    expect(r.status).toBe('closed');
    expect(r.teams[1]).toMatchObject({ choice: 2, lockedAt: 21_000, lockedBy: 'timeout' });
    expect(r.teams[2]).toMatchObject({ choice: null, lockedAt: 21_000 });
    expect(castVote(r, 1, 'a', 0, 21_060)).toEqual({ ok: false, error: 'CLOSED' });
  });

  it('kết quả: đúng/sai và thứ tự chốt theo ms', () => {
    let r = start();
    r = ok(castVote(r, 2, 'x', 2, 1100));
    r = ok(castVote(r, 2, 'y', 2, 1100));
    r = ok(lockTeam(r, 2, 'x', ctx2, 4321));
    r = ok(castVote(r, 1, 'a', 0, 1200));
    r = ok(castVote(r, 1, 'b', 0, 1200));
    r = ok(lockTeam(r, 1, 'a', ctx1, 4400));
    r = closeRound(r, contexts, 4400);
    const reveal = publicQuestionView(r).reveal!;
    expect(reveal.answerIndex).toBe(2);
    expect(reveal.explanation).toBe('Giải thích bí mật');
    expect(reveal.results.map((x) => [x.teamId, x.correct, x.lockedAfterMs])).toEqual([
      [2, true, 3321],
      [1, false, 3400],
      [3, false, 3400],
    ]);
  });
});

describe('không lộ đáp án khi câu còn mở', () => {
  it('publicQuestionView và teamQuestionView không chứa đáp án, giải thích, lựa chọn nhóm khác', () => {
    let r = start();
    r = ok(castVote(r, 1, 'a', 2, 1100));
    r = ok(castVote(r, 1, 'b', 2, 1100));
    r = ok(lockTeam(r, 1, 'a', ctx1, 1200));
    const pub = publicQuestionView(r);
    expect(pub.reveal).toBeNull();
    expect(pub.locked).toEqual([{ teamId: 1, lockedAfterMs: 200 }]);
    expect(leaks(pub)).toBe(false);
    // nhóm 2 không thấy gì về nhóm 1
    const team2 = teamQuestionView(r, 2, ctx2)!;
    expect(leaks(team2)).toBe(false);
    // nhóm 1 thấy lựa chọn đã chốt của CHÍNH MÌNH (không phải đáp án)
    expect(teamQuestionView(r, 1, ctx1)!.choice).toBe(2);
  });

  it('sau khi đóng mới có đáp án', () => {
    const r = closeRound(start(), contexts, 30_000);
    expect(leaks(publicQuestionView(r))).toBe(true);
  });
});

describe('teamQuestionView', () => {
  it('đếm phiếu, số online đã bầu, trạng thái nút CHỐT', () => {
    let r = ok(castVote(start(), 1, 'a', 0, 1100));
    let v = teamQuestionView(r, 1, ctx1)!;
    expect(v).toMatchObject({ tally: [1, 0, 0, 0], onlineCount: 3, votedOnlineCount: 1, canLock: false, captainId: 'a' });
    r = ok(castVote(r, 1, 'c', 3, 1200));
    v = teamQuestionView(r, 1, ctx1)!;
    expect(v).toMatchObject({ tally: [1, 0, 0, 1], votes: { a: 0, c: 3 }, canLock: true, locked: false, choice: null });
  });
});
