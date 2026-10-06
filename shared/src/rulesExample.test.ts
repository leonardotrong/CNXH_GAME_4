import { describe, expect, it } from 'vitest';
import { CONSTITUTION_CELL, ORGANS, cellsOf, neighbors, organAt, startCell, targetError } from './board';
import { TEAM_IDS } from './lobby';
import { RULES_EXAMPLE } from './rulesExample';

/** Bản đồ minh họa ở màn luật phải đúng luật — sinh viên học luật từ chính hình này (GAME_SPEC 5.1 RULES). */
describe('RULES_EXAMPLE', () => {
  const { board, targets } = RULES_EXAMPLE;

  it('mỗi nhóm có ô xuất phát của mình và lãnh thổ liền một khối, lan từ viền vào trong', () => {
    for (const t of TEAM_IDS) {
      const cells = cellsOf(board, t);
      expect(cells, `Nhóm ${t}`).toContain(startCell(t));
      // Loang từ ô xuất phát theo ô kề cùng chủ: phải chạm đủ mọi ô của nhóm.
      const seen = new Set([startCell(t)]);
      const queue = [startCell(t)];
      while (queue.length) for (const n of neighbors(queue.shift()!)) if (board.owners[n] === t && !seen.has(n)) seen.add(n), queue.push(n);
      expect(seen.size, `Nhóm ${t}`).toBe(cells.length);
    }
  });

  it('các nhóm có số ô bằng nhau (ví dụ không gợi ý nhóm nào mạnh hơn)', () => {
    expect(new Set(TEAM_IDS.map((t) => cellsOf(board, t).length)).size).toBe(1);
  });

  it('mọi mục tiêu là ô nhóm đó được nhắm (kề lãnh thổ, không phải ô của mình)', () => {
    for (const [t, cell] of Object.entries(targets)) {
      expect(cell).not.toBeNull();
      expect(targetError(board, Number(t), cell!), `Nhóm ${t}`).toBeNull();
    }
  });

  it('ô Hiến pháp còn trống và bị hai nhóm cùng nhắm (minh họa tranh chấp)', () => {
    expect(board.owners[CONSTITUTION_CELL]).toBeNull();
    expect(Object.values(targets).filter((c) => c === CONSTITUTION_CELL)).toHaveLength(2);
  });

  it('có cả ô Cơ quan đã có chủ lẫn ô Cơ quan còn trống', () => {
    const owned = ORGANS.filter((o) => board.owners[o.cell] !== null);
    expect(owned.length).toBeGreaterThan(0);
    expect(owned.length).toBeLessThan(ORGANS.length);
  });

  it('★ Lòng dân nằm trên ô thường còn trống, ít nhất 2 nhóm nhắm được (như cách server đặt sao, GAME_SPEC 3.7)', () => {
    expect(board.stars).toHaveLength(1);
    const star = board.stars[0]!;
    expect(star).not.toBe(CONSTITUTION_CELL);
    expect(organAt(star)).toBeNull();
    expect(board.owners[star]).toBeNull();
    expect(TEAM_IDS.filter((t) => targetError(board, t, star) === null).length).toBeGreaterThanOrEqual(2);
  });

  it('không có khiên (khiên chỉ giải thích bằng lời)', () => {
    expect(board.shields).toEqual([]);
  });
});
