/**
 * Tình huống biên của GAME_SPEC 3.3–3.5 (giải quyết lượt Bàn Cờ).
 * Ký hiệu: ok(t) = trả lời đúng, chốt lúc t (ms, giờ server); no(t) = trả lời sai.
 */
import { describe, expect, it } from 'vitest';
import { CONSTITUTION_CELL, OUTER_RING, cellsOf, validTargets, type BoardState } from './board';
import { c, mk } from './boardFixtures';
import { resolveTurn, type TeamAnswer, type TurnInput } from './resolveTurn';

const ok = (lockedAt: number): TeamAnswer => ({ correct: true, lockedAt });
const no = (lockedAt: number): TeamAnswer => ({ correct: false, lockedAt });

const run = (board: BoardState, targets: TurnInput['targets'], answers: TurnInput['answers']) =>
  resolveTurn({ board, targets, answers });
const cellOf = (res: ReturnType<typeof resolveTurn>, cellId: number) =>
  res.outcome.cells.find((x) => x.cellId === cellId);

// Bố cục dùng chung: nhóm 1 ở A=(0,-1), nhóm 2 ở B=(1,-1) (kề nhau); ô trống E=(0,-2) kề A, không kề B.
const A = c(0, -1);
const B = c(1, -1);
const E = c(0, -2);

describe('3.3 — một nhóm tấn công', () => {
  const base = mk([[0, -1, 1], [1, -1, 2]]);

  it('ô trống, trả lời đúng → chiếm', () => {
    const res = run(base, { 1: E }, { 1: ok(100), 2: no(50) });
    expect(res.board.owners[E]).toBe(1);
    expect(cellOf(res, E)).toMatchObject({ result: 'captured', previousOwner: null, newOwner: 1, winner: 1, marginMs: null });
    expect(res.outcome.gains).toEqual({ 1: 1 });
    expect(res.outcome.losses).toEqual({});
  });

  it('ô trống, trả lời sai → giữ nguyên', () => {
    const res = run(base, { 1: E }, { 1: no(100) });
    expect(res.board.owners[E]).toBeNull();
    expect(cellOf(res, E)).toMatchObject({ result: 'failed', newOwner: null, winner: null });
  });

  it('không có câu trả lời (vắng mặt trong answers) → coi như sai', () => {
    const res = run(base, { 1: E }, {});
    expect(res.board.owners[E]).toBeNull();
    expect(cellOf(res, E)!.result).toBe('failed');
  });

  it('ô có chủ, chủ trả lời sai → đổi chủ', () => {
    const res = run(base, { 1: B }, { 1: ok(500), 2: no(100) });
    expect(res.board.owners[B]).toBe(1);
    expect(cellOf(res, B)).toMatchObject({ result: 'captured', previousOwner: 2, newOwner: 1 });
    expect(res.outcome.losses).toEqual({ 2: 1 });
  });

  it('chủ đúng nhưng chậm hơn → đổi chủ, ghi chênh lệch ms', () => {
    const res = run(base, { 1: B }, { 1: ok(1000), 2: ok(1240) });
    expect(res.board.owners[B]).toBe(1);
    expect(cellOf(res, B)).toMatchObject({ result: 'captured', winner: 1, marginMs: 240 });
  });

  it('chủ đúng và nhanh hơn → phòng thủ thành công', () => {
    const res = run(base, { 1: B }, { 1: ok(1300), 2: ok(1000) });
    expect(res.board.owners[B]).toBe(2);
    expect(cellOf(res, B)).toMatchObject({ result: 'defended', previousOwner: 2, newOwner: 2, winner: 2, marginMs: 300 });
    expect(res.outcome.losses).toEqual({});
  });

  it('chủ phòng thủ dù đang nhắm ô khác, và cùng lượt vẫn chiếm được ô đó', () => {
    const res = run(base, { 1: B, 2: c(2, -1) }, { 1: ok(900), 2: ok(800) });
    expect(res.board.owners[B]).toBe(2);
    expect(res.board.owners[c(2, -1)]).toBe(2);
    expect(cellOf(res, B)!.result).toBe('defended');
  });

  it('chủ phòng thủ dù bỏ lượt chọn ô (mục tiêu null)', () => {
    const res = run(base, { 1: B, 2: null }, { 1: ok(900), 2: ok(800) });
    expect(res.board.owners[B]).toBe(2);
  });

  it('chủ không có câu trả lời (nhóm không còn ai) → không phòng thủ được', () => {
    const res = run(base, { 1: B }, { 1: ok(20_000) });
    expect(res.board.owners[B]).toBe(1);
  });

  it('danh sách người tranh: đúng trước (theo thời điểm), sai sau; ghi vai trò', () => {
    const board = mk([[0, -1, 1], [1, -1, 2], [1, -2, 3], [2, -2, 4]]);
    const res = run(board, { 1: B, 3: B, 4: B }, { 1: no(10), 2: ok(300), 3: ok(200), 4: no(5) });
    expect(cellOf(res, B)!.contenders).toEqual([
      { teamId: 3, role: 'attacker', correct: true, lockedAt: 200 },
      { teamId: 2, role: 'defender', correct: true, lockedAt: 300 },
      { teamId: 1, role: 'attacker', correct: false, lockedAt: 10 },
      { teamId: 4, role: 'attacker', correct: false, lockedAt: 5 },
    ]);
    expect(cellOf(res, B)!.attackers).toEqual([1, 3, 4]);
  });
});

describe('3.3 — nhiều nhóm tranh một ô', () => {
  // Ô trống (0,-2) kề nhóm 1 (0,-1), nhóm 2 (1,-2), nhóm 3 (-1,-2).
  const board = mk([[0, -1, 1], [1, -2, 2], [-1, -2, 3]]);

  it('ô trống, nhiều nhóm đúng → nhóm chốt sớm nhất thắng', () => {
    const res = run(board, { 1: E, 2: E, 3: E }, { 1: ok(3000), 2: ok(2100), 3: ok(2500) });
    expect(res.board.owners[E]).toBe(2);
    expect(cellOf(res, E)).toMatchObject({ result: 'captured', winner: 2, marginMs: 400 });
  });

  it('nhóm chốt nhanh nhất nhưng sai bị bỏ qua', () => {
    const res = run(board, { 1: E, 2: E, 3: E }, { 1: ok(3000), 2: no(100), 3: ok(2500) });
    expect(res.board.owners[E]).toBe(3);
    expect(cellOf(res, E)).toMatchObject({ winner: 3, marginMs: 500 });
  });

  it('tất cả sai → giữ nguyên', () => {
    const res = run(board, { 1: E, 2: E, 3: E }, { 1: no(1), 2: no(2), 3: no(3) });
    expect(res.board.owners[E]).toBeNull();
    expect(cellOf(res, E)!.result).toBe('failed');
  });

  it('ô có chủ bị 2 nhóm tấn công: chủ đứng giữa → kẻ tấn công nhanh nhất thắng', () => {
    const b = mk([[0, -1, 1], [1, -1, 2], [1, -2, 3]]);
    const res = run(b, { 1: B, 3: B }, { 1: ok(3000), 2: ok(2000), 3: ok(1000) });
    expect(res.board.owners[B]).toBe(3);
    expect(cellOf(res, B)).toMatchObject({ result: 'captured', winner: 3, marginMs: 1000 });
  });

  it('ô có chủ bị 2 nhóm tấn công: chủ nhanh nhất → phòng thủ thành công', () => {
    const b = mk([[0, -1, 1], [1, -1, 2], [1, -2, 3]]);
    const res = run(b, { 1: B, 3: B }, { 1: ok(3000), 2: ok(500), 3: ok(1000) });
    expect(res.board.owners[B]).toBe(2);
    expect(cellOf(res, B)).toMatchObject({ result: 'defended', winner: 2, marginMs: 500 });
  });
});

describe('3.3 — trùng mili-giây', () => {
  const board = mk([[0, -1, 1], [1, -2, 2], [1, -1, 3]]);

  it('hai kẻ tấn công đúng cùng sớm nhất (vd. cùng tự chốt lúc hết giờ) → ô giữ nguyên', () => {
    const res = run(board, { 1: E, 2: E }, { 1: ok(20_000), 2: ok(20_000) });
    expect(res.board.owners[E]).toBeNull();
    expect(cellOf(res, E)).toMatchObject({ result: 'tie', newOwner: null, winner: null, marginMs: 0 });
  });

  it('kẻ tấn công và chủ cùng sớm nhất → chủ giữ ô', () => {
    const res = run(board, { 1: B }, { 1: ok(700), 3: ok(700) });
    expect(res.board.owners[B]).toBe(3);
    expect(cellOf(res, B)).toMatchObject({ result: 'tie', newOwner: 3, winner: null });
    expect(res.outcome.losses).toEqual({});
  });

  it('trùng giờ ở vị trí sau không ảnh hưởng người sớm nhất', () => {
    const b = mk([[0, -1, 1], [1, -2, 2], [-1, -2, 3]]);
    const res = run(b, { 1: E, 2: E, 3: E }, { 1: ok(100), 2: ok(900), 3: ok(900) });
    expect(res.board.owners[E]).toBe(1);
    expect(cellOf(res, E)).toMatchObject({ result: 'captured', marginMs: 800 });
  });
});

describe('3.3 — tính đồng thời trên trạng thái đầu lượt', () => {
  it('hoán đổi: 1 nhắm ô của 2, 2 nhắm ô của 1, cả hai đúng, 1 nhanh hơn → 1 chiếm ô của 2 và giữ ô mình', () => {
    const board = mk([[0, -1, 1], [1, -1, 2]]);
    const res = run(board, { 1: B, 2: A }, { 1: ok(100), 2: ok(200) });
    expect(res.board.owners[A]).toBe(1);
    expect(res.board.owners[B]).toBe(1);
    expect(cellOf(res, A)!.result).toBe('defended');
    expect(cellOf(res, B)!.result).toBe('captured');
  });

  it('vòng tròn 1→2→3→1, đều đúng: mỗi ô xét riêng trên trạng thái đầu lượt', () => {
    // Ba ô đôi một kề nhau quanh một đỉnh.
    const [X1, X2, X3] = [c(0, -1), c(1, -1), c(0, 0)];
    const board = mk([[0, -1, 1], [1, -1, 2], [0, 0, 3]]);
    const res = run(board, { 1: X2, 2: X3, 3: X1 }, { 1: ok(1), 2: ok(2), 3: ok(3) });
    expect(res.board.owners[X2]).toBe(1); // 1 (1ms) nhanh hơn chủ 2 (2ms)
    expect(res.board.owners[X3]).toBe(2); // 2 (2ms) nhanh hơn chủ 3 (3ms)
    expect(res.board.owners[X1]).toBe(1); // chủ 1 (1ms) nhanh hơn 3 → phòng thủ
    expect(res.outcome.losses).toEqual({ 2: 1, 3: 1 });
    expect(res.outcome.gains).toEqual({ 1: 1, 2: 1 });
  });

  it('một nhóm vừa mất ô A vừa chiếm ô B trong cùng lượt', () => {
    const board = mk([[0, -1, 1], [1, -1, 2]]);
    const res = run(board, { 1: B, 2: c(1, -2) }, { 1: ok(100), 2: ok(200) });
    expect(res.board.owners[B]).toBe(1);
    expect(cellsOf(res.board, 2)).toEqual([c(1, -2)]);
  });

  it('mục tiêu xét trên đầu lượt: mất ô X (ô duy nhất kề Y) vẫn chiếm được Y', () => {
    // Nhóm 2 chỉ có X=(1,-1); Y=(2,-1) chỉ kề nhóm 2 qua X. Nhóm 1 chiếm X.
    const X = c(1, -1);
    const Y = c(2, -1);
    const board = mk([[0, -1, 1], [1, -1, 2]]);
    const res = run(board, { 1: X, 2: Y }, { 1: ok(100), 2: ok(200) });
    expect(res.board.owners[X]).toBe(1);
    expect(res.board.owners[Y]).toBe(2);
    expect(res.outcome.ignored).toEqual([]);
  });

  it('không kiểm tra liên thông: lãnh thổ bị cắt đôi vẫn giữ nguyên', () => {
    // Nhóm 2 có dải (−1,0) (0,0) (1,0); nhóm 1 chiếm ô giữa.
    const board = mk([[-1, 0, 2], [0, 0, 2], [1, 0, 2], [0, -1, 1]]);
    const res = run(board, { 1: CONSTITUTION_CELL }, { 1: ok(1), 2: no(1) });
    expect(res.board.owners[CONSTITUTION_CELL]).toBe(1);
    expect(res.board.owners[c(-1, 0)]).toBe(2);
    expect(res.board.owners[c(1, 0)]).toBe(2);
  });

  it('mất ô cuối cùng → nhóm còn 0 ô, lượt sau chọn theo luật vòng ngoài', () => {
    const board = mk([[0, -1, 1], [1, -1, 2]]);
    const res = run(board, { 1: B }, { 1: ok(1), 2: no(1) });
    expect(cellsOf(res.board, 2)).toEqual([]);
    expect([...validTargets(res.board, 2)].sort((a, z) => a - z)).toEqual([...OUTER_RING].sort((a, z) => a - z));
  });

  it('không sửa đổi bàn cờ đầu vào', () => {
    const board = mk([[0, -1, 1], [1, -1, 2]]);
    const before = JSON.stringify(board);
    run(board, { 1: B }, { 1: ok(1) });
    expect(JSON.stringify(board)).toBe(before);
  });

  it('kết quả sắp theo id ô, không phụ thuộc thứ tự khóa của input', () => {
    const board = mk([[0, -1, 1], [1, -1, 2]]);
    const res = run(board, { 2: c(2, -1), 1: CONSTITUTION_CELL }, { 1: ok(1), 2: ok(2) });
    const ids = res.outcome.cells.map((x) => x.cellId);
    expect(ids).toEqual([...ids].sort((a, z) => a - z));
  });
});

describe('3.3 — mục tiêu không hợp lệ bị bỏ qua (kiểm tra lại cho an toàn)', () => {
  const board = mk([[0, -3, 1], [1, -1, 2]]);

  it('không kề lãnh thổ', () => {
    const res = run(board, { 1: CONSTITUTION_CELL }, { 1: ok(1) });
    expect(res.board.owners[CONSTITUTION_CELL]).toBeNull();
    expect(res.outcome.ignored).toEqual([{ teamId: 1, cellId: CONSTITUTION_CELL, reason: 'NOT_ADJACENT' }]);
    expect(res.outcome.cells).toEqual([]);
  });

  it('ô của chính mình', () => {
    const res = run(board, { 2: B }, { 2: ok(1) });
    expect(res.outcome.ignored).toEqual([{ teamId: 2, cellId: B, reason: 'OWN_CELL' }]);
    expect(res.board.owners[B]).toBe(2);
  });

  it('ngoài bàn cờ / không phải số nguyên', () => {
    const res = run(board, { 1: 99, 2: -1 }, { 1: ok(1), 2: ok(1) });
    expect(res.outcome.ignored.map((x) => x.reason)).toEqual(['NOT_ON_BOARD', 'NOT_ON_BOARD']);
    expect(res.board.owners).toEqual(board.owners);
  });

  it('nhóm 0 ô: ô vòng ngoài hợp lệ, ô vòng trong không', () => {
    const b = mk([[1, -1, 2], [0, -3, 3]]);
    const res = run(b, { 1: c(0, -3), 4: c(0, -2) }, { 1: ok(1), 4: ok(1), 3: no(1) });
    expect(res.board.owners[c(0, -3)]).toBe(1);
    expect(res.outcome.ignored).toEqual([{ teamId: 4, cellId: c(0, -2), reason: 'NOT_ADJACENT' }]);
  });

  it('nhóm có mục tiêu hợp lệ vẫn được xử lý khi nhóm khác nhắm sai', () => {
    const b = mk([[0, -1, 1], [0, -3, 2]]);
    const res = run(b, { 1: E, 2: CONSTITUTION_CELL }, { 1: ok(5), 2: ok(1) });
    expect(res.board.owners[E]).toBe(1);
    expect(res.board.owners[CONSTITUTION_CELL]).toBeNull();
  });
});

describe('3.4 — ô Hiến pháp và Khiên Hiến pháp', () => {
  it('chiếm ô Hiến pháp (kề lãnh thổ) → Khiên Hiến pháp cho lượt kế tiếp', () => {
    const board = mk([[0, -1, 1]]);
    const res = run(board, { 1: CONSTITUTION_CELL }, { 1: ok(1) });
    expect(res.board.owners[CONSTITUTION_CELL]).toBe(1);
    expect(res.board.shields).toEqual([{ teamId: 1, reason: 'constitution' }]);
    expect(res.outcome.shieldsGranted).toEqual(res.board.shields);
  });

  it('lượt kế tiếp: mọi ô của nhóm có khiên không thể bị tấn công (vô hiệu dù đúng và nhanh)', () => {
    const board = mk([[0, -1, 1], [0, 0, 1], [1, -1, 2]], [{ teamId: 1, reason: 'constitution' }]);
    const res = run(board, { 2: A }, { 1: no(9), 2: ok(1) });
    expect(res.board.owners[A]).toBe(1);
    expect(cellOf(res, A)).toMatchObject({ result: 'shielded', newOwner: 1, winner: null, attackers: [2] });
    expect(res.outcome.losses).toEqual({});
    expect(res.outcome.ignored).toEqual([]);
  });

  it('khiên có hiệu lực đúng một lượt: hết khiên sau lượt đó', () => {
    const board = mk([[0, -1, 1], [0, 0, 1], [1, -1, 2]], [{ teamId: 1, reason: 'constitution' }]);
    const t1 = run(board, {}, {});
    expect(t1.board.shields).toEqual([]);
    const t2 = run(t1.board, { 2: A }, { 2: ok(1) });
    expect(t2.board.owners[A]).toBe(2);
  });

  it('giữ ô Hiến pháp (phòng thủ thành công) không gia hạn khiên', () => {
    const board = mk([[0, -1, 1], [0, 0, 1], [1, -1, 2]]);
    const res = run(board, { 2: CONSTITUTION_CELL }, { 1: ok(1), 2: ok(2) });
    expect(res.board.owners[CONSTITUTION_CELL]).toBe(1);
    expect(cellOf(res, CONSTITUTION_CELL)!.result).toBe('defended');
    expect(res.board.shields).toEqual([]);
  });

  it('giành lại ô Hiến pháp: nhóm chiếm có khiên, nhóm mất (1 ô) không có', () => {
    const board = mk([[0, -1, 1], [0, 0, 1], [1, -1, 2]]);
    const res = run(board, { 2: CONSTITUTION_CELL }, { 1: ok(5), 2: ok(2) });
    expect(res.board.owners[CONSTITUTION_CELL]).toBe(2);
    expect(res.board.shields).toEqual([{ teamId: 2, reason: 'constitution' }]);
  });

  it('nhóm có khiên vẫn tấn công được trong lượt có khiên', () => {
    const board = mk([[0, -1, 1], [1, -1, 2]], [{ teamId: 1, reason: 'protection' }]);
    const res = run(board, { 1: B }, { 1: ok(1), 2: no(1) });
    expect(res.board.owners[B]).toBe(1);
  });

  it('chủ có khiên không cần trả lời đúng; ô trống/ô khác của lượt vẫn giải quyết bình thường', () => {
    const board = mk([[0, -1, 1], [1, -1, 2], [1, -2, 3]], [{ teamId: 2, reason: 'protection' }]);
    const res = run(board, { 1: B, 3: E }, { 1: ok(1), 3: ok(2) });
    expect(res.board.owners[B]).toBe(2);
    expect(res.board.owners[E]).toBe(3);
  });
});

describe('3.5 — Khiên bảo hộ (chống "hội đồng")', () => {
  // Nhóm 2 có 3 ô: (1,-1), (1,0), (2,-1); các nhóm 1, 3, 4 đứng quanh.
  const P = c(1, -1);
  const Q = c(1, 0);
  const R = c(2, -1);
  const board = mk([[1, -1, 2], [1, 0, 2], [2, -1, 2], [0, -1, 1], [0, 1, 3], [2, -2, 4]]);

  it('mất đúng 1 ô → không có khiên', () => {
    const res = run(board, { 1: P }, { 1: ok(1) });
    expect(res.outcome.losses).toEqual({ 2: 1 });
    expect(res.board.shields).toEqual([]);
  });

  it('mất 2 ô trong một lượt → Khiên bảo hộ cho lượt kế tiếp', () => {
    const res = run(board, { 1: P, 3: Q }, { 1: ok(1), 3: ok(2) });
    expect(res.outcome.losses).toEqual({ 2: 2 });
    expect(res.board.shields).toEqual([{ teamId: 2, reason: 'protection' }]);
    // Lượt kế: không ai nhắm được ô còn lại của nhóm 2.
    expect(validTargets(res.board, 4)).not.toContain(R);
  });

  it('mất 2 ô nhưng cùng lượt chiếm được 1 ô → vẫn nhận khiên (đếm tổng số ô mất)', () => {
    const res = run(board, { 1: P, 3: Q, 2: c(3, -2) }, { 1: ok(1), 3: ok(2), 2: ok(3) });
    expect(res.outcome.losses).toEqual({ 2: 2 });
    expect(res.outcome.gains[2]).toBe(1);
    expect(res.board.shields).toEqual([{ teamId: 2, reason: 'protection' }]);
  });

  it('mất hết ô (3 → 0) → vẫn nhận khiên', () => {
    const res = run(board, { 1: P, 3: Q, 4: R }, { 1: ok(1), 3: ok(2), 4: ok(3) });
    expect(cellsOf(res.board, 2)).toEqual([]);
    expect(res.board.shields).toEqual([{ teamId: 2, reason: 'protection' }]);
  });

  it('phòng thủ thành công không tính là mất ô', () => {
    const res = run(board, { 1: P, 3: Q }, { 1: ok(5), 3: ok(6), 2: ok(1) });
    expect(res.outcome.losses).toEqual({});
    expect(res.board.shields).toEqual([]);
  });

  it('vừa chiếm ô Hiến pháp vừa mất ≥ 2 ô → nhận cả hai khiên', () => {
    // Nhóm 2 kề (0,0) qua (1,-1) và (1,0).
    const res = run(board, { 1: P, 3: Q, 2: CONSTITUTION_CELL }, { 1: ok(1), 3: ok(2), 2: ok(3) });
    expect(res.board.owners[CONSTITUTION_CELL]).toBe(2);
    expect(res.board.shields).toEqual([
      { teamId: 2, reason: 'constitution' },
      { teamId: 2, reason: 'protection' },
    ]);
  });

  it('nhiều nhóm cùng nhận khiên; khiên cũ hết hạn, chỉ còn khiên mới', () => {
    // Nhóm 5 đang có khiên (từ lượt trước); nhóm 2 mất 2 ô, nhóm 1 chiếm Hiến pháp.
    const b = mk(
      [[1, -1, 2], [1, 0, 2], [2, -1, 2], [0, -1, 1], [0, 1, 3], [2, -2, 4], [-3, 3, 5]],
      [{ teamId: 5, reason: 'protection' }],
    );
    const res = run(b, { 3: Q, 4: P, 1: CONSTITUTION_CELL }, { 3: ok(1), 4: ok(2), 1: ok(3) });
    expect(res.board.shields).toEqual([
      { teamId: 1, reason: 'constitution' },
      { teamId: 2, reason: 'protection' },
    ]);
  });
});
