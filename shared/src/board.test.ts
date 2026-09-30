import { describe, expect, it } from 'vitest';
import {
  BOARD_RADIUS,
  CELLS,
  CELL_COUNT,
  CONSTITUTION_CELL,
  OUTER_RING,
  START_RING_INDICES,
  cellAt,
  cellsOf,
  hexDistance,
  initialBoard,
  isShielded,
  neighbors,
  scoreOf,
  startCell,
  targetError,
  validTargets,
} from './board';
import { c, mk } from './boardFixtures';
import { TEAM_IDS } from './lobby';

describe('lưới lục giác (3.1)', () => {
  it('bán kính 3 → 37 ô, không trùng, đều trong khoảng cách 3', () => {
    expect(BOARD_RADIUS).toBe(3);
    expect(CELLS).toHaveLength(37);
    expect(CELL_COUNT).toBe(37);
    expect(new Set(CELLS.map((x) => `${x.q},${x.r}`)).size).toBe(37);
    CELLS.forEach((cell, i) => {
      expect(cell.id).toBe(i);
      expect(hexDistance(cell, { q: 0, r: 0 })).toBeLessThanOrEqual(3);
      expect(cell.ring).toBe(hexDistance(cell, { q: 0, r: 0 }));
    });
  });

  it('cellAt: ngoài bàn cờ → null', () => {
    expect(cellAt(0, -4)).toBeNull();
    expect(cellAt(-1, -3)).toBeNull(); // khoảng cách 4
    expect(cellAt(2, 2)).toBeNull();
    expect(CELLS[c(2, -1)]).toMatchObject({ q: 2, r: -1 });
  });

  it('ô Hiến pháp là (0,0)', () => {
    expect(CELLS[CONSTITUTION_CELL]).toMatchObject({ q: 0, r: 0, ring: 0 });
  });

  it('vòng ngoài 18 ô, bắt đầu từ (0,-3), theo chiều kim đồng hồ, liên tiếp kề nhau', () => {
    expect(OUTER_RING).toHaveLength(18);
    const at = (i: number) => CELLS[OUTER_RING[i]!]!;
    expect(at(0)).toMatchObject({ q: 0, r: -3 });
    expect(at(1)).toMatchObject({ q: 1, r: -3 });
    expect(at(3)).toMatchObject({ q: 3, r: -3 });
    expect(at(6)).toMatchObject({ q: 3, r: 0 });
    expect(at(9)).toMatchObject({ q: 0, r: 3 });
    expect(at(12)).toMatchObject({ q: -3, r: 3 });
    expect(at(15)).toMatchObject({ q: -3, r: 0 });
    expect(new Set(OUTER_RING).size).toBe(18);
    OUTER_RING.forEach((id, i) => {
      expect(CELLS[id]!.ring).toBe(3);
      expect(neighbors(id)).toContain(OUTER_RING[(i + 1) % 18]);
    });
  });

  it('ô xuất phát: vị trí 0,3,5,8,10,13,15 của vòng ngoài cho Nhóm 1–7', () => {
    expect(START_RING_INDICES).toEqual([0, 3, 5, 8, 10, 13, 15]);
    expect(TEAM_IDS.map((t) => startCell(t))).toEqual(START_RING_INDICES.map((i) => OUTER_RING[i]));
    expect(CELLS[startCell(1)]).toMatchObject({ q: 0, r: -3 });
    expect(CELLS[startCell(4)]).toMatchObject({ q: 1, r: 2 });
    expect(CELLS[startCell(7)]).toMatchObject({ q: -3, r: 0 });
    // Không có hai ô xuất phát nào kề nhau.
    for (const a of TEAM_IDS) for (const b of TEAM_IDS) {
      if (a !== b) expect(neighbors(startCell(a))).not.toContain(startCell(b));
    }
  });

  it('ô kề: 6 hướng axial, cắt theo mép bàn cờ, đối xứng', () => {
    expect([...neighbors(CONSTITUTION_CELL)].sort((a, b) => a - b)).toEqual(
      [c(1, 0), c(-1, 0), c(0, 1), c(0, -1), c(1, -1), c(-1, 1)].sort((a, b) => a - b),
    );
    expect(neighbors(c(0, -3))).toHaveLength(3); // góc
    expect(neighbors(c(1, -3))).toHaveLength(4); // cạnh
    for (const cell of CELLS) {
      for (const n of neighbors(cell.id)) {
        expect(hexDistance(cell, CELLS[n]!)).toBe(1);
        expect(neighbors(n)).toContain(cell.id);
      }
    }
  });
});

describe('initialBoard', () => {
  it('mỗi nhóm có người nhận đúng ô xuất phát, còn lại trống, không có khiên', () => {
    const b = initialBoard(TEAM_IDS);
    expect(b.shields).toEqual([]);
    expect(b.owners.filter((o) => o !== null)).toHaveLength(7);
    for (const t of TEAM_IDS) expect(cellsOf(b, t)).toEqual([startCell(t)]);
    expect(b.owners[CONSTITUTION_CELL]).toBeNull();
  });

  it('nhóm chưa có thành viên không nhận ô xuất phát', () => {
    const b = initialBoard([1, 3, 4]);
    expect(b.owners[startCell(2)]).toBeNull();
    expect(cellsOf(b, 2)).toEqual([]);
    expect(cellsOf(b, 3)).toEqual([startCell(3)]);
  });
});

describe('mục tiêu hợp lệ (3.2)', () => {
  it('ô kề không thuộc nhóm mình: ô trống, ô nhóm khác, ô Hiến pháp', () => {
    const b = mk([[0, -1, 1], [1, -1, 2]]);
    const targets = validTargets(b, 1);
    expect(targets).toContain(c(1, -1)); // ô nhóm 2
    expect(targets).toContain(CONSTITUTION_CELL);
    expect(targets).toContain(c(0, -2)); // ô trống
    expect(targets).not.toContain(c(0, -1)); // ô của mình
    expect(targets).toHaveLength(6);
    expect([...targets].sort((a, z) => a - z)).toEqual(targets); // sắp theo id
  });

  it('đầu trận: nhóm 1 ở góc (0,-3) có đúng 3 mục tiêu', () => {
    const b = initialBoard(TEAM_IDS);
    expect(validTargets(b, 1)).toEqual([c(-1, -2), c(1, -3), c(0, -2)].sort((a, z) => a - z));
  });

  it('không kề lãnh thổ → không hợp lệ', () => {
    const b = mk([[0, -3, 1]]);
    expect(validTargets(b, 1)).not.toContain(CONSTITUTION_CELL);
    expect(targetError(b, 1, CONSTITUTION_CELL)).toBe('NOT_ADJACENT');
  });

  it('kề nhiều ô của mình chỉ tính một lần', () => {
    const b = mk([[0, -1, 1], [1, -1, 1]]);
    const targets = validTargets(b, 1);
    expect(new Set(targets).size).toBe(targets.length);
  });

  it('loại mọi ô của nhóm đang có khiên (kể cả ô Hiến pháp)', () => {
    const b = mk([[0, -1, 1], [1, -1, 2], [0, 0, 2]], [{ teamId: 2, reason: 'constitution' }]);
    expect(validTargets(b, 1)).not.toContain(c(1, -1));
    expect(validTargets(b, 1)).not.toContain(CONSTITUTION_CELL);
    expect(targetError(b, 1, c(1, -1))).toBe('SHIELDED');
    expect(isShielded(b, 2)).toBe(true);
    expect(isShielded(b, 1)).toBe(false);
  });

  it('nhóm có khiên vẫn có mục tiêu bình thường', () => {
    const b = mk([[0, -1, 1], [1, -1, 2]], [{ teamId: 1, reason: 'protection' }]);
    expect(validTargets(b, 1)).toContain(c(1, -1));
  });

  it('lỗi cụ thể: ô của mình, ngoài bàn cờ', () => {
    const b = mk([[0, -1, 1]]);
    expect(targetError(b, 1, c(0, -1))).toBe('OWN_CELL');
    expect(targetError(b, 1, -1)).toBe('NOT_ON_BOARD');
    expect(targetError(b, 1, 37)).toBe('NOT_ON_BOARD');
    expect(targetError(b, 1, 1.5)).toBe('NOT_ON_BOARD');
    expect(targetError(b, 1, c(0, -2))).toBeNull();
  });

  it('nhóm không còn ô nào: chọn bất kỳ ô vòng ngoài (trống hoặc của nhóm khác), không chọn vòng trong', () => {
    const b = mk([[0, -3, 2], [0, 0, 3]]);
    const targets = validTargets(b, 1);
    expect([...targets].sort((a, z) => a - z)).toEqual([...OUTER_RING].sort((a, z) => a - z));
    expect(targets).toContain(c(0, -3)); // ô vòng ngoài của nhóm 2
    expect(targetError(b, 1, CONSTITUTION_CELL)).toBe('NOT_ADJACENT');
    expect(targetError(b, 1, c(0, -2))).toBe('NOT_ADJACENT');
  });

  it('nhóm không còn ô nào: vẫn loại ô vòng ngoài của nhóm có khiên', () => {
    const b = mk([[0, -3, 2], [1, -3, 3]], [{ teamId: 2, reason: 'protection' }]);
    const targets = validTargets(b, 1);
    expect(targets).toHaveLength(17);
    expect(targets).not.toContain(c(0, -3));
    expect(targets).toContain(c(1, -3));
  });

  it('mọi ô kề đều là của mình hoặc của nhóm có khiên → không có mục tiêu', () => {
    // Nhóm 1 ở góc (0,-3); ba ô kề đều thuộc nhóm 2 đang có khiên.
    const b = mk(
      [[0, -3, 1], [1, -3, 2], [0, -2, 2], [-1, -2, 2]],
      [{ teamId: 2, reason: 'protection' }],
    );
    expect(validTargets(b, 1)).toEqual([]);
  });
});

describe('điểm (3.6)', () => {
  it('điểm = số ô, ô Hiến pháp tính 3', () => {
    const b = mk([[0, -1, 1], [1, -1, 1], [0, 0, 2], [0, 1, 2]]);
    expect(scoreOf(b, 1)).toBe(2);
    expect(scoreOf(b, 2)).toBe(4);
    expect(scoreOf(b, 3)).toBe(0);
  });
});
