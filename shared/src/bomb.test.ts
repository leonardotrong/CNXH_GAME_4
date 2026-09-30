import { describe, expect, it } from 'vitest';
import { CONSTITUTION_CELL, cellsOf, initialBoard } from './board';
import { c, mk } from './boardFixtures';
import {
  BOMB_CELLS_LOST,
  castPass,
  clampBombCount,
  closePassRound,
  explodeCells,
  firstHolder,
  fuseDeadline,
  igniteFuse,
  isFuseSpent,
  lockPass,
  nextBomb,
  openPassRound,
  passBomb,
  passChoice,
  passTargets,
  pauseFuse,
  publicBombView,
  recordExplosion,
  rollFuse,
  startBombGame,
  teamPassView,
  type BombGame,
  type Fuse,
} from './bomb';
import { TEAM_IDS } from './lobby';
import { emptyStats } from './standings';
import type { TeamContext } from './voteRound';

const ctx = (...ids: string[]): TeamContext => ({ memberIds: ids, onlineIds: ids, captainId: ids[0] ?? null });
const NOBODY = ctx();
const seq = (...values: number[]) => {
  let i = 0;
  return () => values[i++ % values.length]!;
};

describe('ngòi nổ', () => {
  it('ngẫu nhiên trong [min, max], bắt đầu ở trạng thái dừng', () => {
    const range = { minMs: 30_000, maxMs: 60_000 };
    expect(rollFuse(range, () => 0)).toEqual({ remainingMs: 30_000, burningSince: null });
    expect(rollFuse(range, () => 0.999999).remainingMs).toBe(60_000);
    for (let i = 0; i < 200; i++) {
      const f = rollFuse(range);
      expect(f.remainingMs).toBeGreaterThanOrEqual(30_000);
      expect(f.remainingMs).toBeLessThanOrEqual(60_000);
    }
  });

  it('chỉ trừ khi đang cháy; dừng rồi cháy tiếp cộng dồn đúng', () => {
    let f: Fuse = { remainingMs: 30_000, burningSince: null };
    expect(fuseDeadline(f)).toBeNull();
    expect(pauseFuse(f, 99_000)).toBe(f); // đang dừng: thời gian trôi không trừ
    f = igniteFuse(f, 1000);
    expect(igniteFuse(f, 5000)).toBe(f); // đang cháy: không đặt lại mốc
    expect(fuseDeadline(f)).toBe(31_000);
    f = pauseFuse(f, 13_000); // cháy 12 s
    expect(f).toEqual({ remainingMs: 18_000, burningSince: null });
    // 20 s REVEAL + PASS: không trừ
    f = igniteFuse(f, 33_000);
    expect(fuseDeadline(f)).toBe(51_000);
    expect(isFuseSpent(f, 50_999)).toBe(false);
    expect(isFuseSpent(f, 51_000)).toBe(true); // đúng mili-giây hết ngòi = nổ
    expect(pauseFuse(f, 80_000)).toEqual({ remainingMs: 0, burningSince: null });
    expect(isFuseSpent(pauseFuse(f, 80_000), 0)).toBe(true);
  });
});

describe('ai cầm bom đầu tiên (4.4)', () => {
  const board = mk([[0, -3, 1], [1, -3, 1], [2, -3, 1], [3, -3, 2], [3, -2, 2], [0, 3, 3]]);
  const active = [1, 2, 3];

  it('quả 1: nhóm dẫn đầu', () => {
    expect(firstHolder(board, emptyStats(), active)).toBe(1);
  });

  it('quả sau: trừ nhóm vừa bị nổ → nhóm xếp ngay sau', () => {
    expect(firstHolder(board, emptyStats(), active, 1)).toBe(2);
    expect(firstHolder(board, emptyStats(), active, 2)).toBe(1);
  });

  it('đồng hạng: theo tiêu chí phụ, rồi nhóm số nhỏ hơn', () => {
    const tie = mk([[0, -3, 2], [0, 3, 5]]);
    expect(firstHolder(tie, emptyStats(), [2, 5])).toBe(2);
    const stats = { ...emptyStats(), 5: { correct: 3, correctLockMs: 9000 } };
    expect(firstHolder(tie, stats, [2, 5])).toBe(5);
  });

  it('chỉ xét nhóm có thành viên; không còn ai → null', () => {
    expect(firstHolder(board, emptyStats(), [2, 3])).toBe(2);
    expect(firstHolder(board, emptyStats(), [])).toBeNull();
    expect(firstHolder(board, emptyStats(), [3], 3)).toBeNull();
  });
});

describe('nhóm được nhận bom (4.3)', () => {
  it('mọi nhóm khác có thành viên, trừ nhóm vừa chuyền cho mình (không chuyền ngược)', () => {
    expect(passTargets(3, null, [1, 2, 3, 4])).toEqual([1, 2, 4]);
    expect(passTargets(3, 2, [1, 2, 3, 4])).toEqual([1, 4]);
    expect(passTargets(3, 2, [1, 2, 3, 4, 5, 6, 7])).not.toContain(2);
  });

  it('chỉ còn nhóm vừa chuyền → được chuyền ngược; chỉ một nhóm chơi → rỗng', () => {
    expect(passTargets(1, 2, [1, 2])).toEqual([2]);
    expect(passTargets(1, null, [1])).toEqual([]);
  });
});

describe('nổ', () => {
  it('mất đúng 2 ô ngẫu nhiên, ô trở thành ô trống, nhóm khác không ảnh hưởng', () => {
    const board = mk([[0, -3, 1], [1, -3, 1], [2, -3, 1], [3, -3, 1], [0, 3, 2]]);
    const { board: after, lost } = explodeCells(board, 1, seq(0, 0));
    expect(lost).toHaveLength(BOMB_CELLS_LOST);
    expect(lost).toEqual([c(0, -3), c(1, -3)].sort((a, b) => a - b));
    for (const id of lost) expect(after.owners[id]).toBeNull();
    expect(cellsOf(after, 1)).toHaveLength(2);
    expect(after.owners[c(0, 3)]).toBe(2);
    expect(board.owners[c(0, -3)]).toBe(1); // hàm thuần: không sửa bàn cờ cũ
  });

  it('ngẫu nhiên thật sự chọn trong các ô của nhóm', () => {
    const board = mk([[0, -3, 1], [1, -3, 1], [2, -3, 1], [3, -3, 1]]);
    for (let i = 0; i < 50; i++) {
      const { lost } = explodeCells(board, 1);
      expect(new Set(lost).size).toBe(2);
      for (const id of lost) expect(board.owners[id]).toBe(1);
    }
  });

  it('còn ≤ 2 ô thì mất hết; 0 ô thì không mất gì', () => {
    expect(explodeCells(mk([[0, -3, 1], [1, -3, 1]]), 1).lost).toHaveLength(2);
    expect(explodeCells(mk([[0, -3, 1]]), 1).lost).toEqual([c(0, -3)]);
    expect(explodeCells(mk([[0, -3, 2]]), 1).lost).toEqual([]);
  });

  it('ô Hiến pháp cũng có thể bị nổ và trở thành ô trống', () => {
    const board = mk([[0, 0, 1], [1, -1, 1]]);
    const { board: after } = explodeCells(board, 1);
    expect(after.owners[CONSTITUTION_CELL]).toBeNull();
  });
});

describe('các quả bom', () => {
  const board = mk([[0, -3, 1], [1, -3, 1], [3, -3, 2], [0, 3, 3]]);
  const setup = { board, stats: emptyStats(), activeTeamIds: [1, 2, 3], fuseRange: { minMs: 40_000, maxMs: 40_000 } };

  it('quả 1 do nhóm dẫn đầu cầm, ngòi dừng, số bom được giới hạn 1–5', () => {
    const g = startBombGame({ ...setup, totalBombs: 3 })!;
    expect(g).toMatchObject({ bombNumber: 1, totalBombs: 3, holder: 1, passedFrom: null, lastPass: null, explosions: [] });
    expect(g.fuse).toEqual({ remainingMs: 40_000, burningSince: null });
    expect(clampBombCount(0)).toBe(1);
    expect(clampBombCount(99)).toBe(5);
    expect(clampBombCount(undefined)).toBe(3);
    expect(startBombGame({ ...setup, activeTeamIds: [] })).toBeNull();
  });

  it('chuyền: nhóm nhận cầm bom, nhớ nhóm vừa chuyền; ngòi giữ nguyên', () => {
    let g = startBombGame(setup)!;
    g = { ...g, fuse: { remainingMs: 12_345, burningSince: null } };
    g = passBomb(g, 2, false);
    expect(g).toMatchObject({ holder: 2, passedFrom: 1, lastPass: { from: 1, to: 2, random: false } });
    expect(g.fuse.remainingMs).toBe(12_345);
    expect(passTargets(g.holder, g.passedFrom, setup.activeTeamIds)).toEqual([3]);
  });

  it('quả kế: nhóm dẫn đầu trừ nhóm vừa nổ; ngòi mới; hết bom → null', () => {
    let g = startBombGame({ ...setup, totalBombs: 2 })!;
    g = recordExplosion(g, [c(0, -3), c(1, -3)]);
    expect(g.explosions).toEqual([{ bombNumber: 1, teamId: 1, cells: [c(0, -3), c(1, -3)] }]);
    // Bàn cờ sau nổ: nhóm 1 mất 2 ô → nhóm 2 và 3 đồng hạng; nhưng dù nhóm 1 vẫn dẫn đầu cũng bị loại trừ.
    const g2 = nextBomb(g, { ...setup, fuseRange: { minMs: 31_000, maxMs: 31_000 } })!;
    expect(g2).toMatchObject({ bombNumber: 2, holder: 2, passedFrom: null, lastPass: null });
    expect(g2.fuse).toEqual({ remainingMs: 31_000, burningSince: null });
    expect(nextBomb(g2, setup)).toBeNull();
  });
});

describe('vòng chọn nhóm nhận bom', () => {
  const open = () => openPassRound({ roundId: 5, holder: 3, targets: [1, 4], now: 1000, durationMs: 10_000 });

  it('chỉ nhóm cầm bom bỏ phiếu, chỉ nhận nhóm hợp lệ', () => {
    const r = open();
    expect(r.teamIds).toEqual([3]);
    expect(castPass(r, 3, 'a', 2, 1500)).toEqual({ ok: false, error: 'BAD_OPTION' });
    expect(castPass(r, 3, 'a', 3, 1500)).toEqual({ ok: false, error: 'BAD_OPTION' });
    expect(castPass(r, 1, 'x', 4, 1500)).toEqual({ ok: false, error: 'NOT_IN_ROUND' });
    const voted = castPass(r, 3, 'a', 4, 1500);
    expect(voted.ok).toBe(true);
  });

  it('đội trưởng chốt → lựa chọn của nhóm', () => {
    let r = open();
    const res = castPass(r, 3, 'a', 4, 1500);
    if (!res.ok) throw new Error();
    expect(lockPass(res.round, 3, 'a', ctx('a', 'b'), 2000)).toEqual({ ok: false, error: 'NOT_ENOUGH_VOTES' });
    const locked = lockPass(res.round, 3, 'a', ctx('a'), 2000);
    if (!locked.ok) throw new Error(locked.error);
    r = closePassRound(locked.round, { 3: ctx('a') }, 2000, () => 0);
    expect(passChoice(r)).toBe(4);
    expect(r.randomPick).toBe(false);
  });

  it('hết giờ có phiếu → theo đa số (2.2); không phiếu → ngẫu nhiên trong nhóm hợp lệ', () => {
    const res = castPass(open(), 3, 'b', 4, 1500);
    if (!res.ok) throw new Error();
    const byVote = closePassRound(res.round, { 3: ctx('a', 'b', 'c') }, 11_000, () => 0);
    expect(passChoice(byVote)).toBe(4);
    expect(byVote.randomPick).toBe(false);

    const random = closePassRound(open(), { 3: NOBODY }, 11_000, () => 0.99);
    expect(passChoice(random)).toBe(4);
    expect(random.randomPick).toBe(true);
    expect(passChoice(closePassRound(open(), { 3: NOBODY }, 11_000, () => 0))).toBe(1);
    expect(passChoice(open())).toBeNull();
  });

  it('phiếu của nhóm: tally theo số nhóm, kèm nhóm hợp lệ', () => {
    const res = castPass(open(), 3, 'a', 4, 1500);
    if (!res.ok) throw new Error();
    const view = teamPassView(res.round, 3, ctx('a', 'b'))!;
    expect(view.tally).toHaveLength(8);
    expect(view.tally[4]).toBe(1);
    expect(view.validTargets).toEqual([1, 4]);
    expect(teamPassView(res.round, 1, ctx('x'))).toBeNull();
  });
});

describe('dữ liệu công khai không chứa ngòi', () => {
  const base = (fuseMs: number, burningSince: number | null): BombGame => ({
    bombNumber: 2,
    totalBombs: 3,
    holder: 4,
    passedFrom: 1,
    fuse: { remainingMs: fuseMs, burningSince },
    lastPass: { from: 1, to: 4, random: false },
    explosions: [{ bombNumber: 1, teamId: 2, cells: [3, 9] }],
  });

  it('chỉ có các trường cho phép', () => {
    const view = publicBombView(base(43_210, 7000), null);
    expect(Object.keys(view).sort()).toEqual(
      ['bombNumber', 'burning', 'explosions', 'holder', 'lastPass', 'pass', 'passedFrom', 'totalBombs'].sort(),
    );
    const json = JSON.stringify(view);
    expect(json).not.toMatch(/fuse|remaining|burningSince|deadline/i);
    expect(json).not.toContain('43210');
    expect(json).not.toContain('50210');
    expect(view.burning).toBe(true);
    expect(publicBombView(base(43_210, null), null).burning).toBe(false);
  });

  it('không phụ thuộc giá trị ngòi', () => {
    for (const since of [null, 5000]) {
      expect(publicBombView(base(1, since), null)).toEqual(publicBombView(base(59_999, since), null));
    }
    const pass = openPassRound({ roundId: 1, holder: 4, targets: [2, 3], now: 0, durationMs: 10_000 });
    expect(publicBombView(base(1, null), pass)).toEqual(publicBombView(base(59_999, null), pass));
  });
});

describe('bàn cờ đầu trận vẫn dùng được', () => {
  it('firstHolder trên bàn cờ đầu trận: đồng hạng hết → nhóm 1', () => {
    expect(firstHolder(initialBoard(TEAM_IDS), emptyStats(), TEAM_IDS)).toBe(1);
  });
});
