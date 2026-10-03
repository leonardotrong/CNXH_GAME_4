import { describe, expect, it } from 'vitest';
import { CELLS, CONSTITUTION_CELL, initialBoard, organAt, targetError, type BoardState } from './board';
import { c, mk } from './boardFixtures';
import { TEAM_IDS } from './lobby';
import { isStarTurn, pickStarCell, withStar } from './stars';

/** Mọi kết quả `pickStarCell` khi rng chạy đều trên [0, 1). */
function picks(board: BoardState, active: readonly number[], n = 60): Set<number | null> {
  return new Set(Array.from({ length: n }, (_, i) => pickStarCell(board, active, () => i / n)));
}

describe('isStarTurn', () => {
  it('★ Lòng dân xuất hiện khi bắt đầu các lượt 3, 6, 9, 12…', () => {
    expect([...Array(14).keys()].map((i) => i + 1).filter(isStarTurn)).toEqual([3, 6, 9, 12]);
    expect(isStarTurn(0)).toBe(false);
  });
});

describe('withStar', () => {
  it('thêm ★ (không trùng), không sửa bàn cờ gốc', () => {
    const b = mk([]);
    const once = withStar(b, c(2, -2));
    expect(once.stars).toEqual([c(2, -2)]);
    expect(withStar(once, c(2, -2)).stars).toEqual([c(2, -2)]);
    expect(b.stars).toEqual([]);
  });
});

describe('pickStarCell (GAME_SPEC 3.7)', () => {
  it('không bao giờ chọn ô Hiến pháp, ô Cơ quan hay ô đã có ★', () => {
    const b = withStar(initialBoard(TEAM_IDS), c(3, -2));
    for (const cell of picks(b, TEAM_IDS)) {
      expect(cell).not.toBeNull();
      expect(cell).not.toBe(CONSTITUTION_CELL);
      expect(organAt(cell!)).toBeNull();
      expect(cell).not.toBe(c(3, -2));
    }
  });

  it('mọi nhóm bằng điểm (đầu trận): rơi vào ô trống giữa hai nhóm cạnh nhau', () => {
    expect(picks(initialBoard(TEAM_IDS), TEAM_IDS)).toEqual(new Set([c(3, -2), c(0, 2), c(0, 3), c(-3, 1)]));
  });

  it('ưu tiên ô trống mà ít nhất 2 nhóm không dẫn đầu nhắm được', () => {
    // Nhóm 1 dẫn đầu (3 ô, ở xa); nhóm 2 và 3 chỉ có chung một ô kề: (3,-2).
    const b = mk([[0, -3, 1], [-1, -2, 1], [1, -3, 1], [3, -3, 2], [3, -1, 3]]);
    expect(picks(b, [1, 2, 3])).toEqual(new Set([c(3, -2)]));
  });

  it('không rơi vào ô của nhóm dẫn đầu hay nhóm đang có khiên', () => {
    // Nhóm 1 dẫn đầu và giữ (3,-2) — ô kề cả nhóm 2 lẫn nhóm 3; nhóm 4 (có khiên) giữ (2,0).
    // Còn lại: (3,0) và (2,-1) là ô trống mà nhóm 3 và nhóm 4 cùng nhắm được.
    const b = {
      ...mk([[3, -2, 1], [0, -3, 1], [-1, -2, 1], [3, -3, 2], [3, -1, 3], [2, 0, 4]]),
      shields: [{ teamId: 4, reason: 'protection' as const }],
    };
    expect(picks(b, [1, 2, 3, 4])).toEqual(new Set([c(3, 0), c(2, -1)]));
  });

  it('chỉ một nhóm không dẫn đầu: chọn ô nhóm đó nhắm được', () => {
    const b = mk([[0, -3, 1], [1, -3, 1], [3, -3, 2]]);
    for (const cell of picks(b, [1, 2])) {
      expect(cell).not.toBeNull();
      expect(targetError(b, 2, cell!)).toBeNull();
    }
  });

  it('không còn ô nào phù hợp → null (lượt đó không có ★)', () => {
    const owners = CELLS.map((cell) => (cell.id === CONSTITUTION_CELL || organAt(cell.id) ? null : 1));
    const b: BoardState = { owners, shields: [], stars: [] };
    expect(pickStarCell(b, [1, 2], () => 0.5)).toBeNull();
  });

  it('cùng rng → cùng kết quả (server quyết định, kiểm thử được)', () => {
    const b = initialBoard(TEAM_IDS);
    expect(pickStarCell(b, TEAM_IDS, () => 0.42)).toBe(pickStarCell(b, TEAM_IDS, () => 0.42));
  });
});
