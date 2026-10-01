import { describe, expect, it } from 'vitest';
import { castPass, openPassRound, type PassRound } from './bomb';
import { c, mk } from './boardFixtures';
import { castVote, lockTeam, openRound, teamQuestionView, type QuestionRound } from './questionRound';
import type { PresentedQuestion } from './questions';
import { castTarget, openSelectRound } from './selectRound';
import type { TeamContext, VoteResult, VoteRound } from './voteRound';

/** GAME_SPEC 2.2 — tự chốt khi mọi thành viên online đã bỏ phiếu. */

const question: PresentedQuestion = {
  questionId: 'q1', pool: 'board', prompt: 'Câu?',
  options: ['A', 'B', 'C', 'D'], answerIndex: 2, explanation: 'Giải thích',
};
const ctx: TeamContext = { memberIds: ['a', 'b', 'c'], onlineIds: ['a', 'b', 'c'], captainId: 'a' };
const start = () => openRound({ roundId: 1, question, teamIds: [1, 2], now: 1000, durationMs: 20_000 });

const ok = <R extends VoteRound>(r: VoteResult<R>): R => {
  if (!r.ok) throw new Error(r.error);
  return r.round;
};

describe('tự chốt khi đủ phiếu (câu hỏi)', () => {
  it('chưa đủ phiếu → chưa chốt; phiếu của người online cuối cùng → chốt ngay, lockedAt = lúc nhận phiếu đó', () => {
    let r: QuestionRound = ok(castVote(start(), 1, 'a', 1, 2000, ctx));
    r = ok(castVote(r, 1, 'b', 1, 2500, ctx));
    expect(r.teams[1]!.lockedAt).toBeNull();
    r = ok(castVote(r, 1, 'c', 3, 3100, ctx));
    expect(r.teams[1]).toMatchObject({ lockedAt: 3100, lockedBy: 'auto', choice: 1 });
    expect(r.status).toBe('open'); // chỉ nhóm này chốt, vòng vẫn mở cho nhóm khác
  });

  it('đã tự chốt thì không đổi phiếu và đội trưởng không chốt lại', () => {
    let r: QuestionRound = start();
    for (const [p, at] of [['a', 2000], ['b', 2100], ['c', 2200]] as const) r = ok(castVote(r, 1, p, 0, at, ctx));
    expect(castVote(r, 1, 'a', 2, 2300, ctx)).toEqual({ ok: false, error: 'LOCKED' });
    expect(lockTeam(r, 1, 'a', ctx, 2300)).toEqual({ ok: false, error: 'LOCKED' });
  });

  it('chỉ tính thành viên đang online: người offline không cần bỏ phiếu', () => {
    const partly: TeamContext = { ...ctx, onlineIds: ['a', 'b'] };
    let r = ok(castVote(start(), 1, 'a', 0, 2000, partly));
    expect(r.teams[1]!.lockedAt).toBeNull();
    r = ok(castVote(r, 1, 'b', 2, 2400, partly));
    expect(r.teams[1]).toMatchObject({ lockedAt: 2400, lockedBy: 'auto' });
  });

  it('hòa phiếu → theo phiếu đội trưởng (như khi CHỐT)', () => {
    const four: TeamContext = { memberIds: ['a', 'b', 'c', 'd'], onlineIds: ['a', 'b', 'c', 'd'], captainId: 'c' };
    let r: QuestionRound = start();
    r = ok(castVote(r, 1, 'a', 0, 2000, four));
    r = ok(castVote(r, 1, 'b', 0, 2100, four));
    r = ok(castVote(r, 1, 'c', 3, 2200, four));
    r = ok(castVote(r, 1, 'd', 3, 2300, four));
    expect(r.teams[1]).toMatchObject({ lockedBy: 'auto', choice: 3 });
  });

  it('phiếu của người đã rời nhóm không được tính là "đủ phiếu"', () => {
    // 'z' bỏ phiếu rồi bị chuyển sang nhóm khác: nhóm còn a, b.
    const after: TeamContext = { memberIds: ['a', 'b'], onlineIds: ['a', 'b'], captainId: 'a' };
    let r = ok(castVote(start(), 1, 'z', 0, 1500, { ...after, memberIds: ['a', 'b', 'z'], onlineIds: ['a', 'b', 'z'] }));
    r = ok(castVote(r, 1, 'a', 0, 2000, after));
    expect(r.teams[1]!.lockedAt).toBeNull();
    r = ok(castVote(r, 1, 'b', 1, 2100, after));
    expect(r.teams[1]).toMatchObject({ lockedAt: 2100, lockedBy: 'auto' });
  });

  it('nhóm chỉ một người online: chạm là chốt', () => {
    const solo: TeamContext = { memberIds: ['a'], onlineIds: ['a'], captainId: 'a' };
    const r = ok(castVote(start(), 1, 'a', 2, 1800, solo));
    expect(r.teams[1]).toMatchObject({ lockedAt: 1800, lockedBy: 'auto', choice: 2 });
  });

  it('bỏ phiếu lại cùng phương án (không đổi gì) vẫn kích hoạt tự chốt nếu đã đủ', () => {
    // Ví dụ: người thứ ba vừa online lại sau khi đã bỏ phiếu — lần bấm kế tiếp sẽ chốt.
    let r = ok(castVote(start(), 1, 'a', 0, 2000, { ...ctx, onlineIds: ['a', 'b', 'c', 'd'] }));
    r = ok(castVote(r, 1, 'b', 0, 2100, { ...ctx, onlineIds: ['a', 'b', 'c', 'd'] }));
    r = ok(castVote(r, 1, 'c', 0, 2200, { ...ctx, onlineIds: ['a', 'b', 'c', 'd'] }));
    expect(r.teams[1]!.lockedAt).toBeNull();
    r = ok(castVote(r, 1, 'c', 0, 2600, ctx));
    expect(r.teams[1]).toMatchObject({ lockedAt: 2600, lockedBy: 'auto' });
  });

  it('không truyền thông tin nhóm → không tự chốt (giữ hành vi cũ cho nơi gọi không biết nhóm)', () => {
    let r: QuestionRound = start();
    for (const p of ['a', 'b', 'c']) r = ok(castVote(r, 1, p, 0, 2000));
    expect(r.teams[1]!.lockedAt).toBeNull();
  });

  it('view của nhóm hiện đã chốt + lựa chọn', () => {
    let r: QuestionRound = start();
    for (const p of ['a', 'b', 'c']) r = ok(castVote(r, 1, p, 1, 2000, ctx));
    expect(teamQuestionView(r, 1, ctx)).toMatchObject({ locked: true, choice: 1, canLock: false });
  });
});

describe('tự chốt khi đủ phiếu (chọn ô, chuyền bom)', () => {
  it('SELECT', () => {
    const board = mk([[0, -3, 1], [3, -3, 2]]);
    let r = openSelectRound({ roundId: 7, board, teamIds: [1, 2], now: 1000, durationMs: 15_000 });
    r = ok(castTarget(r, 1, 'a', c(1, -3), 2000, ctx));
    r = ok(castTarget(r, 1, 'b', c(1, -3), 2100, ctx));
    r = ok(castTarget(r, 1, 'c', c(0, -2), 2200, ctx));
    expect(r.teams[1]).toMatchObject({ lockedAt: 2200, lockedBy: 'auto', choice: c(1, -3) });
  });

  it('PASS', () => {
    let r: PassRound = openPassRound({ roundId: 9, holder: 1, targets: [2, 3], now: 1000, durationMs: 10_000 });
    r = ok(castPass(r, 1, 'a', 3, 2000, ctx));
    r = ok(castPass(r, 1, 'b', 3, 2100, ctx));
    r = ok(castPass(r, 1, 'c', 2, 2200, ctx));
    expect(r.teams[1]).toMatchObject({ lockedAt: 2200, lockedBy: 'auto', choice: 3 });
  });
});
