import { describe, expect, it } from 'vitest';
import { CONSTITUTION_CELL } from './board';
import { c } from './boardFixtures';
import { describeCell, describeExplosion, describeStar } from './describe';
import type { CellOutcome } from './resolveTurn';

const outcome = (o: Partial<CellOutcome>): CellOutcome => ({
  cellId: c(2, -2),
  previousOwner: null,
  newOwner: 1,
  result: 'captured',
  attackers: [1],
  winner: 1,
  marginMs: null,
  contenders: [{ teamId: 1, role: 'attacker', correct: true, lockedAt: 5 }],
  star: false,
  ...o,
});

describe('describeCell — tên ô (GAME_SPEC 3.7)', () => {
  it('ô thường và ô Hiến pháp như trước', () => {
    expect(describeCell(outcome({}))).toBe('Nhóm 1 chiếm ô trống');
    expect(describeCell(outcome({ previousOwner: 2 }))).toBe('Nhóm 1 chiếm ô của Nhóm 2');
    expect(describeCell(outcome({ cellId: CONSTITUTION_CELL }))).toBe('Nhóm 1 chiếm ô Hiến pháp');
  });

  it('ô Cơ quan gọi theo tên cơ quan', () => {
    expect(describeCell(outcome({ cellId: c(0, -1) }))).toBe('Nhóm 1 chiếm ô Quốc hội');
    expect(describeCell(outcome({ cellId: c(-1, 0), previousOwner: 3 }))).toBe('Nhóm 1 chiếm ô Viện kiểm sát của Nhóm 3');
  });

  it('ô có ★ Lòng dân', () => {
    expect(describeCell(outcome({ star: true }))).toBe('Nhóm 1 chiếm ô ★');
    expect(describeCell(outcome({ star: true, previousOwner: 4 }))).toBe('Nhóm 1 chiếm ô ★ của Nhóm 4');
  });
});

describe('describeExplosion / describeStar', () => {
  it('nổ: nêu ô Hiến pháp và ô Cơ quan bị mất', () => {
    expect(describeExplosion({ bombNumber: 1, teamId: 2, cells: [c(1, -1), CONSTITUTION_CELL] })).toBe(
      'Bom nổ ở Nhóm 2: mất 2 ô (có ô Hiến pháp, ô Chính phủ)',
    );
    expect(describeExplosion({ bombNumber: 1, teamId: 2, cells: [c(3, -3)] })).toBe('Bom nổ ở Nhóm 2: mất 1 ô');
  });

  it('★ xuất hiện ở ô trống / ô có chủ (chủ ô được thêm 1 điểm)', () => {
    const id = c(2, -2);
    expect(describeStar(id, null)).toBe(`★ Lòng dân xuất hiện ở ô #${id} (2,-2)`);
    expect(describeStar(id, 5)).toBe(`★ Lòng dân xuất hiện ở ô #${id} (2,-2) — ô của Nhóm 5, Nhóm 5 được thêm 1 điểm`);
  });
});
