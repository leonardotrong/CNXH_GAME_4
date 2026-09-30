import { describe, expect, it } from 'vitest';
import { CELL_COUNT, initialBoard, startCell, validTargets } from './board';
import { c, mk } from './boardFixtures';
import { TEAM_IDS } from './lobby';
import type { TeamContext } from './voteRound';
import {
  castTarget,
  closeSelectRound,
  lockTarget,
  openSelectRound,
  publicSelectView,
  selectedTargets,
  teamSelectView,
} from './selectRound';

const ctx = (...ids: string[]): TeamContext => ({ memberIds: ids, onlineIds: ids, captainId: ids[0] ?? null });
const NOBODY = ctx();

function open(board = initialBoard(TEAM_IDS)) {
  return openSelectRound({ roundId: 7, board, teamIds: TEAM_IDS, now: 1000, durationMs: 15_000 });
}

describe('openSelectRound', () => {
  it('mỗi nhóm có danh sách ô hợp lệ tính trên bàn cờ đầu lượt', () => {
    const board = initialBoard(TEAM_IDS);
    const r = open(board);
    expect(r.teamIds).toEqual([...TEAM_IDS]);
    for (const t of TEAM_IDS) expect(r.validTargets[t]).toEqual(validTargets(board, t));
    expect(r.endsAt).toBe(16_000);
    expect(r.status).toBe('open');
  });

  it('nhóm không có ô hợp lệ nào không tham gia vòng chọn (bỏ lượt)', () => {
    const board = mk(
      [[0, -3, 1], [1, -3, 2], [0, -2, 2], [-1, -2, 2]],
      [{ teamId: 2, reason: 'protection' }],
    );
    const r = open(board);
    expect(r.teamIds).not.toContain(1);
    expect(r.teamIds).toContain(2);
  });
});

describe('bỏ phiếu chọn ô', () => {
  it('chỉ nhận ô hợp lệ của nhóm mình', () => {
    const r = open();
    expect(castTarget(r, 1, 'a', startCell(2), 2000)).toEqual({ ok: false, error: 'BAD_OPTION' });
    expect(castTarget(r, 1, 'a', startCell(1), 2000)).toEqual({ ok: false, error: 'BAD_OPTION' });
    expect(castTarget(r, 1, 'a', 999, 2000)).toEqual({ ok: false, error: 'BAD_OPTION' });
    expect(castTarget(r, 1, 'a', c(1, -3), 2000).ok).toBe(true);
  });

  it('nhóm không tham gia vòng chọn → NOT_IN_ROUND', () => {
    const board = mk(
      [[0, -3, 1], [1, -3, 2], [0, -2, 2], [-1, -2, 2]],
      [{ teamId: 2, reason: 'protection' }],
    );
    expect(castTarget(open(board), 1, 'a', c(0, -2), 2000)).toEqual({ ok: false, error: 'NOT_IN_ROUND' });
  });

  it('hết giờ → CLOSED', () => {
    expect(castTarget(open(), 1, 'a', c(1, -3), 16_001)).toEqual({ ok: false, error: 'CLOSED' });
  });

  it('chốt theo đa số; không phiếu → bỏ lượt (null)', () => {
    let r = open();
    const apply = (res: ReturnType<typeof castTarget>) => {
      if (!res.ok) throw new Error(res.error);
      r = res.round;
    };
    apply(castTarget(r, 1, 'a', c(1, -3), 2000));
    apply(castTarget(r, 1, 'b', c(0, -2), 2100));
    apply(castTarget(r, 1, 'c', c(0, -2), 2200));
    apply(lockTarget(r, 1, 'a', ctx('a', 'b', 'c'), 3000));
    apply(castTarget(r, 2, 'x', c(2, -3), 2500)); // nhóm 2 không chốt: tự chốt khi đóng
    const contexts = { 1: ctx('a', 'b', 'c'), 2: ctx('x'), 3: NOBODY, 4: NOBODY, 5: NOBODY, 6: NOBODY, 7: NOBODY };
    const closed = closeSelectRound(r, contexts, 20_000);
    expect(selectedTargets(closed)).toEqual({ 1: c(0, -2), 2: c(2, -3), 3: null, 4: null, 5: null, 6: null, 7: null });
  });

  it('selectedTargets khi vòng còn mở → rỗng', () => {
    expect(selectedTargets(open())).toEqual({});
  });
});

describe('dữ liệu gửi client', () => {
  it('host KHÔNG thấy mục tiêu khi SELECT còn mở, chỉ thấy nhóm nào đã chốt', () => {
    let r = open();
    const res1 = castTarget(r, 1, 'a', c(1, -3), 2000);
    if (!res1.ok) throw new Error();
    const res2 = lockTarget(res1.round, 1, 'a', ctx('a'), 2500);
    if (!res2.ok) throw new Error();
    r = res2.round;
    const view = publicSelectView(r);
    expect(view.targets).toBeNull();
    expect(view.locked).toEqual([1]);
    expect(JSON.stringify(view)).not.toMatch(/ballots|choice|votes/);
  });

  it('sau khi đóng: lật mục tiêu của mọi nhóm cùng lúc', () => {
    const r = open();
    const res = castTarget(r, 1, 'a', c(1, -3), 2000);
    if (!res.ok) throw new Error();
    const closed = closeSelectRound(res.round, { 1: ctx('a') }, 20_000);
    expect(publicSelectView(closed).targets).toMatchObject({ 1: c(1, -3), 2: null });
  });

  it('nhóm thấy phiếu của nhóm mình trên từng ô và danh sách ô hợp lệ', () => {
    const r = open();
    const res = castTarget(r, 1, 'a', c(1, -3), 2000);
    if (!res.ok) throw new Error();
    const view = teamSelectView(res.round, 1, ctx('a', 'b'))!;
    expect(view.validTargets).toEqual(validTargets(initialBoard(TEAM_IDS), 1));
    expect(view.tally).toHaveLength(CELL_COUNT);
    expect(view.tally[c(1, -3)]).toBe(1);
    expect(view.votes).toEqual({ a: c(1, -3) });
    expect(view.canLock).toBe(false); // 1/2 chưa quá nửa
    expect(teamSelectView(res.round, 2, ctx('x'))!.votes).toEqual({});
  });
});
