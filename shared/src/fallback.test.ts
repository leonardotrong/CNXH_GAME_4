import { describe, expect, it } from 'vitest';
import { igniteFuse, isFuseSpent, pauseFuse, shiftFuse } from './bomb';
import { FALLBACK_RANK_STEP_MS, rankToLockedAt } from './fallback';
import { castBallot, closeVotes, forceChoices, lockBallots, openVoteRound, shiftVoteRound, type TeamContext } from './voteRound';

const ctx = (ids: string[], captainId = ids[0] ?? null): TeamContext => ({ memberIds: ids, onlineIds: ids, captainId });
const valid = (o: number) => o >= 0 && o < 4;

describe('chế độ dự phòng — forceChoices', () => {
  it('ghi đè phiếu/chốt của nhóm được nhập; nhóm khác giữ nguyên rồi tự chốt khi đóng', () => {
    let r = openVoteRound({ roundId: 1, teamIds: [1, 2, 3], now: 1000, durationMs: 20_000 });
    const a = castBallot(r, 1, 'a', 2, 1100, valid);
    if (!a.ok) throw new Error();
    const l = lockBallots(a.round, 1, 'a', ctx(['a']), 1200);
    if (!l.ok) throw new Error();
    const b = castBallot(l.round, 3, 'c', 1, 1300, valid);
    if (!b.ok) throw new Error();
    r = b.round;
    const res = forceChoices(r, [{ teamId: 1, choice: 0, lockedAt: 3000 }, { teamId: 2, choice: null, lockedAt: 2000 }], valid);
    if (!res.ok) throw new Error(res.error);
    expect(res.round.status).toBe('open');
    expect(res.round.teams[1]).toMatchObject({ choice: 0, lockedAt: 3000, lockedBy: 'admin' });
    expect(res.round.teams[2]).toMatchObject({ choice: null, lockedAt: 2000, lockedBy: 'admin' });
    const closed = closeVotes(res.round, { 1: ctx(['a']), 2: ctx([]), 3: ctx(['c']) }, 5000);
    expect(closed.teams[3]).toMatchObject({ choice: 1, lockedBy: 'timeout', lockedAt: 5000 });
    expect(closed.teams[1]!.lockedBy).toBe('admin');
  });

  it('lựa chọn không hợp lệ hoặc nhóm không trong vòng → không đổi gì', () => {
    const r = openVoteRound({ roundId: 1, teamIds: [1], now: 0, durationMs: 1000 });
    expect(forceChoices(r, [{ teamId: 1, choice: 9, lockedAt: 1 }], valid)).toEqual({ ok: false, error: 'BAD_OPTION' });
    expect(forceChoices(r, [{ teamId: 5, choice: 0, lockedAt: 1 }], valid)).toEqual({ ok: false, error: 'NOT_IN_ROUND' });
    const closed = closeVotes(r, {}, 2000);
    expect(forceChoices(closed, [{ teamId: 1, choice: 0, lockedAt: 1 }], valid)).toEqual({ ok: false, error: 'CLOSED' });
  });

  it('hạng → thời điểm chốt: mỗi hạng 1 giây, cùng hạng cùng mili-giây', () => {
    expect(rankToLockedAt(10_000, 1)).toBe(10_000 + FALLBACK_RANK_STEP_MS);
    expect(rankToLockedAt(10_000, 3)).toBe(13_000);
    expect(rankToLockedAt(10_000, 0)).toBe(11_000);
    expect(rankToLockedAt(10_000, Number.NaN)).toBe(11_000);
  });
});

describe('tạm dừng — dời mốc thời gian', () => {
  it('shiftVoteRound dời hạn, lúc mở, lúc chốt và lúc bỏ phiếu', () => {
    const r0 = openVoteRound({ roundId: 1, teamIds: [1, 2], now: 1000, durationMs: 10_000 });
    const v = castBallot(r0, 1, 'a', 0, 1500, valid);
    if (!v.ok) throw new Error();
    const l = lockBallots(v.round, 1, 'a', ctx(['a']), 2000);
    if (!l.ok) throw new Error();
    const s = shiftVoteRound(l.round, 7000);
    expect(s.startedAt).toBe(8000);
    expect(s.endsAt).toBe(18_000);
    expect(s.teams[1]!.lockedAt).toBe(9000);
    expect(s.teams[1]!.ballots['a']!.castAt).toBe(8500);
    expect(s.teams[2]!.lockedAt).toBeNull();
    // Thời gian chốt tính từ lúc mở không đổi.
    expect(s.teams[1]!.lockedAt! - s.startedAt).toBe(l.round.teams[1]!.lockedAt! - l.round.startedAt);
  });

  it('shiftFuse: ngòi đang cháy giữ nguyên thời gian còn lại; ngòi dừng không đổi', () => {
    const burning = igniteFuse({ remainingMs: 30_000, burningSince: null }, 1000);
    // Cháy 10 s rồi dừng 60 s: còn 20 s.
    const shifted = shiftFuse(burning, 60_000);
    expect(isFuseSpent(shifted, 1000 + 10_000 + 60_000 + 19_999)).toBe(false);
    expect(isFuseSpent(shifted, 1000 + 10_000 + 60_000 + 20_000)).toBe(true);
    expect(pauseFuse(shifted, 71_000).remainingMs).toBe(20_000);
    const paused = { remainingMs: 5000, burningSince: null };
    expect(shiftFuse(paused, 1234)).toBe(paused);
  });
});
