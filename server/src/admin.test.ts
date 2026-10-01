import { beforeEach, describe, expect, it } from 'vitest';
import { OUTER_RING, cellAt, startCell, type Question } from '@cnxh/shared';
import { Room, type RoomSnapshot } from './room';

const BANK: Question[] = [
  { id: 'b1', pool: 'board', topic: 't', type: 'mcq', prompt: 'Câu 1?', options: ['Đ', 'S1', 'S2', 'S3'], answerIndex: 0, explanation: 'x' },
  { id: 'b2', pool: 'board', topic: 't', type: 'mcq', prompt: 'Câu 2?', options: ['Đ', 'S1', 'S2', 'S3'], answerIndex: 0, explanation: 'x' },
  { id: 'm1', pool: 'bomb', topic: 't', type: 'tf', prompt: 'Bom 1?', options: ['Đúng', 'Sai'], answerIndex: 0, explanation: 'x' },
  { id: 'm2', pool: 'bomb', topic: 't', type: 'tf', prompt: 'Bom 2?', options: ['Đúng', 'Sai'], answerIndex: 0, explanation: 'x' },
];
const TIMING = {
  select: 15_000, board: 20_000, boardReveal: 10_000,
  bomb: 12_000, bombReveal: 8_000, bombPass: 10_000, bombExplode: 6_000,
  fuseMin: 30_000, fuseMax: 30_000,
};
const c = (q: number, r: number) => cellAt(q, r)!;

let time = 0;
let room: Room;
const ids: Record<string, string> = {};

function must<T extends { ok: boolean }>(res: T): T {
  if (!res.ok) throw new Error(JSON.stringify(res));
  return res;
}
function join(name: string, teamId: number) {
  const res = must(room.join({ name, teamId }));
  ids[name] = (res as { playerId: string }).playerId;
}
/** Tua tới hạn của pha hiện tại rồi chuyển pha như timer của server. */
function tick() {
  const at = room.nextDeadline();
  if (at === null) throw new Error(`Không có hạn ở pha ${room.phase}`);
  time = Math.max(time, at);
  must(room.advance(BANK));
}
/** CHỐT nếu nhóm chưa tự chốt — nhóm một người online thì phiếu đã tự chốt (GAME_SPEC 2.2). */
function lockIfOpen(name: string, roundId: number) {
  const res = room.lock(ids[name]!, roundId);
  if (!res.ok && res.error !== 'LOCKED') throw new Error(JSON.stringify(res));
}
const answer = () => room.question!.question.answerIndex;
const answerText = () => room.question!.question.options[answer()];

beforeEach(() => {
  time = 10_000;
  room = new Room('1234', () => time, TIMING);
});

describe('Room — pha RULES', () => {
  it('LOBBY → RULES (không đồng hồ) → Bàn Cờ', () => {
    join('An', 1);
    must(room.showRules());
    expect(room.publicGame()).toMatchObject({ phase: 'RULES', phaseEndsAt: null });
    expect(room.nextDeadline()).toBeNull();
    must(room.startBoard(BANK, 2));
    expect(room.phase).toBe('BOARD_SELECT');
    expect(room.showRules()).toEqual({ ok: false, error: 'WRONG_PHASE' });
  });
});

describe('Room — tạm dừng toàn cục', () => {
  beforeEach(() => {
    join('An', 1);
    join('Bình', 2);
  });

  it('SELECT: dừng thì không có hạn, không nhận phiếu; tiếp tục thì hạn dời đúng thời gian dừng', () => {
    must(room.startBoard(BANK, 2));
    const { roundId, endsAt } = room.select!;
    time += 5_000;
    must(room.vote(ids['An']!, roundId, c(1, -3)));
    must(room.pause());
    expect(room.nextDeadline()).toBeNull();
    expect(room.publicGame().pausedAt).toBe(15_000);
    time += 60_000;
    expect(room.vote(ids['Bình']!, roundId, c(2, -3))).toEqual({ ok: false, error: 'PAUSED' });
    expect(room.lock(ids['An']!, roundId)).toEqual({ ok: false, error: 'PAUSED' });
    expect(room.everyoneLocked()).toBe(false);
    must(room.resume());
    expect(room.publicGame().pausedAt).toBeNull();
    expect(room.select!.endsAt).toBe(endsAt + 60_000);
    expect(room.nextDeadline()).toBe(endsAt + 60_000);
    // Phiếu cũ vẫn còn, CHỐT được.
    lockIfOpen('An', roundId);
    expect(room.teamSelect(1)!.choice).toBe(c(1, -3));
  });

  it('câu hỏi: thời gian chốt tính từ lúc mở không đổi qua tạm dừng', () => {
    must(room.startBoard(BANK, 2));
    tick(); // SELECT hết giờ → câu hỏi
    const q = room.question!;
    time += 3_000;
    must(room.vote(ids['An']!, q.roundId, answer()));
    lockIfOpen('An', q.roundId);
    must(room.pause());
    time += 100_000;
    must(room.resume());
    time += 2_000;
    must(room.vote(ids['Bình']!, q.roundId, answer()));
    lockIfOpen('Bình', q.roundId);
    expect(room.everyoneLocked()).toBe(true);
    must(room.advance(BANK));
    const results = room.publicQuestion()!.reveal!.results;
    expect(results.slice(0, 2).map((r) => [r.teamId, r.lockedAfterMs])).toEqual([[1, 3_000], [2, 5_000]]);
  });

  it('Quả Bom: ngòi không cháy khi tạm dừng', () => {
    must(room.startBoard(BANK, 1));
    tick(); // → câu hỏi
    tick(); // → REVEAL
    tick(); // → BOMB_INTRO
    must(room.startBombs(BANK, 1));
    expect(room.phase).toBe('BOMB_QUESTION');
    const start = time;
    expect(room.nextDeadline()).toBe(start + 12_000); // câu hết giờ trước ngòi 30 s
    time += 10_000;
    must(room.pause());
    time += 500_000;
    must(room.resume());
    expect(room.nextDeadline()).toBe(start + 12_000 + 500_000);
    tick(); // câu hết giờ: ngòi đã cháy 12 s (không tính 500 s dừng) → REVEAL, không nổ
    expect(room.phase).toBe('BOMB_REVEAL');
    tick(); // sai (không trả lời) → câu mới, ngòi còn 18 s
    expect(room.phase).toBe('BOMB_QUESTION');
    expect(room.nextDeadline()).toBe(time + 12_000);
    tick();
    tick();
    expect(room.nextDeadline()).toBe(time + 6_000); // còn 6 s ngòi
    tick();
    expect(room.phase).toBe('BOMB_EXPLODE');
  });

  // Thao tác của người dẫn trong lúc dừng: đồng hồ trận đứng yên, mốc mới tính từ lúc tiếp tục.
  it('đổi câu lỗi khi đang dừng: câu mới đủ 20 s tính từ lúc tiếp tục, thời gian chốt không âm', () => {
    must(room.startBoard(BANK, 2));
    tick(); // SELECT hết giờ → câu hỏi
    time += 5_000;
    must(room.pause());
    time += 30_000;
    must(room.replaceBoardQuestion(BANK));
    time += 30_000;
    must(room.resume());
    const q = room.question!;
    expect(room.nextDeadline()).toBe(time + 20_000);
    time += 2_000;
    must(room.vote(ids['An']!, q.roundId, answer()));
    lockIfOpen('An', q.roundId);
    tick(); // nhóm 2 chưa chốt → hết giờ
    const results = room.publicQuestion()!.reveal!.results;
    expect(results.find((r) => r.teamId === 1)).toMatchObject({ correct: true, lockedAfterMs: 2_000 });
    expect(room.match!.stats[1]).toEqual({ correct: 1, correctLockMs: 2_000 });
  });

  it('nhập kết quả dự phòng khi đang dừng: REVEAL đủ 10 s tính từ lúc tiếp tục', () => {
    must(room.startBoard(BANK, 2));
    tick(); // → câu hỏi
    time += 5_000;
    must(room.pause());
    time += 30_000;
    must(room.fallbackAnswers([{ teamId: 1, choice: answer(), rank: 1 }]));
    expect(room.phase).toBe('BOARD_REVEAL');
    expect(room.nextDeadline()).toBeNull();
    time += 30_000;
    must(room.resume());
    expect(room.nextDeadline()).toBe(time + 10_000);
  });

  it('đổi câu bom khi đang dừng: câu mới đủ 12 s sau khi tiếp tục, ngòi không cháy lúc dừng', () => {
    must(room.startBoard(BANK, 1));
    tick(); // → câu hỏi
    tick(); // → REVEAL
    tick(); // → BOMB_INTRO
    must(room.startBombs(BANK, 1));
    time += 10_000; // ngòi 30 s đã cháy 10 s
    must(room.pause());
    time += 100_000;
    must(room.replaceBombQuestion(BANK));
    time += 100_000;
    must(room.resume());
    expect(room.publicGame().phaseEndsAt).toBe(time + 12_000);
    expect(room.nextDeadline()).toBe(time + 12_000); // ngòi còn 20 s
    tick(); // hết giờ → REVEAL: ngòi đã cháy 22 s
    tick(); // sai → câu mới
    expect(room.nextDeadline()).toBe(time + 8_000); // còn 8 s ngòi
  });
});

describe('Room — chế độ dự phòng (không cần điện thoại)', () => {
  it('chơi trọn một lượt Bàn Cờ chỉ bằng nhập tay của người dẫn', () => {
    must(room.setFallback(true));
    must(room.startBoard(BANK, 3));
    // Không ai vào phòng nhưng cả 7 nhóm đều có ô xuất phát.
    for (const t of [1, 2, 3, 4, 5, 6, 7]) expect(room.publicGame().board!.owners[startCell(t)]).toBe(t);
    expect(room.publicGame().fallback).toBe(true);
    // Hết giờ cũng không tự đóng.
    expect(room.nextDeadline()).toBeNull();
    time += 60_000;

    expect(room.fallbackSelect(BANK, { 1: c(0, 0) })).toEqual({ ok: false, error: 'BAD_OPTION' });
    must(room.fallbackSelect(BANK, { 1: OUTER_RING[1]!, 2: OUTER_RING[2]!, 3: null }));
    expect(room.phase).toBe('BOARD_QUESTION');
    expect(room.publicGame().board!.targets).toMatchObject({ 1: OUTER_RING[1], 2: OUTER_RING[2], 3: null, 4: null });
    expect(room.nextDeadline()).toBeNull();

    const a = answer();
    must(
      room.fallbackAnswers([
        { teamId: 1, choice: a, rank: 2 },
        { teamId: 2, choice: (a + 1) % 4, rank: 1 },
        { teamId: 3, choice: a, rank: 3 },
      ]),
    );
    expect(room.phase).toBe('BOARD_REVEAL');
    const view = room.publicGame();
    expect(view.board!.owners[OUTER_RING[1]!]).toBe(1);
    expect(view.board!.owners[OUTER_RING[2]!]).toBeNull();
    const results = room.publicQuestion()!.reveal!.results;
    expect(results.slice(0, 3).map((r) => [r.teamId, r.lockedAfterMs, r.lockedBy, r.correct])).toEqual([
      [2, 1_000, 'admin', false],
      [1, 2_000, 'admin', true],
      [3, 3_000, 'admin', true],
    ]);
    // REVEAL vẫn tự chạy.
    tick();
    expect(room.phase).toBe('BOARD_SELECT');
    expect(room.publicGame().board!.turn).toBe(2);
  });

  it('cùng hạng = trùng mili-giây → ô tranh chấp giữ nguyên', () => {
    must(room.setFallback(true));
    must(room.startBoard(BANK, 3));
    must(room.fallbackSelect(BANK, { 1: OUTER_RING[1]! }));
    // Nhóm 2 nhắm ô của... không kề; dùng chủ ô phòng thủ: nhóm 1 nhắm ô trống thì không có tranh chấp.
    // Chỉnh tay: ô OUTER_RING[1] thuộc nhóm 2 để có phòng thủ.
    must(room.setCellOwner(OUTER_RING[1]!, 2));
    must(room.fallbackAnswers([{ teamId: 1, choice: answer(), rank: 1 }, { teamId: 2, choice: answer(), rank: 1 }]));
    const cell = room.publicGame().board!.outcome!.cells.find((o) => o.cellId === OUTER_RING[1]);
    expect(cell?.result).toBe('tie');
    expect(room.publicGame().board!.owners[OUTER_RING[1]!]).toBe(2);
  });

  it('nhập tay ghi đè điện thoại; nhóm không nhập giữ kết quả điện thoại', () => {
    join('An', 1);
    join('Bình', 2);
    must(room.setFallback(true));
    must(room.startBoard(BANK, 3));
    must(room.fallbackSelect(BANK, {}));
    const q = room.question!;
    time += 4_000;
    must(room.vote(ids['Bình']!, q.roundId, answer()));
    lockIfOpen('Bình', q.roundId);
    must(room.vote(ids['An']!, q.roundId, answer()));
    lockIfOpen('An', q.roundId);
    // Điện thoại đã chốt hết nhưng dự phòng không đóng sớm.
    expect(room.everyoneLocked()).toBe(false);
    must(room.fallbackAnswers([{ teamId: 1, choice: (answer() + 1) % 4, rank: 1 }]));
    const results = room.publicQuestion()!.reveal!.results;
    expect(results.find((r) => r.teamId === 1)).toMatchObject({ correct: false, lockedBy: 'admin' });
    expect(results.find((r) => r.teamId === 2)).toMatchObject({ correct: true, lockedBy: 'auto', lockedAfterMs: 4_000 });
  });

  it('Quả Bom dự phòng: đáp án + nhóm nhận do người dẫn nhập; ngòi chỉ cháy trong thời gian câu', () => {
    must(room.setFallback(true));
    must(room.startBoard(BANK, 1));
    must(room.fallbackSelect(BANK, { 1: OUTER_RING[1]! }));
    must(room.fallbackAnswers([{ teamId: 1, choice: answer(), rank: 1 }]));
    tick(); // → BOMB_INTRO
    must(room.startBombs(BANK, 1));
    expect(room.publicGame().bomb!.holder).toBe(1);
    // Ngòi 30 s > câu 12 s: không có hạn tự động.
    expect(room.nextDeadline()).toBeNull();
    time += 40_000; // người dẫn nhập chậm
    const text = answerText();
    must(room.fallbackAnswers([{ teamId: 1, choice: room.question!.question.options.indexOf(text!), rank: 1 }]));
    expect(room.phase).toBe('BOMB_REVEAL');
    tick();
    expect(room.phase).toBe('BOMB_PASS');
    expect(room.nextDeadline()).toBeNull();
    expect(room.fallbackPass(BANK, 1)).toEqual({ ok: false, error: 'BAD_OPTION' });
    must(room.fallbackPass(BANK, 5));
    expect(room.publicGame().bomb).toMatchObject({ holder: 5, lastPass: { from: 1, to: 5, random: false } });
    // Ngòi còn 18 s (chỉ cháy 12 s của câu trước) — 18 s > 12 s: vẫn chờ người dẫn.
    expect(room.nextDeadline()).toBeNull();
    time += 30_000;
    must(room.fallbackAnswers([{ teamId: 5, choice: null, rank: 1 }]));
    tick(); // REVEAL → sai → câu mới, ngòi còn 6 s < 12 s → có hạn nổ
    expect(room.nextDeadline()).toBe(time + 6_000);
    tick();
    expect(room.phase).toBe('BOMB_EXPLODE');
    expect(room.publicGame().bomb!.explosions[0]!.teamId).toBe(5);
  });
});

describe('Room — chỉnh tay và nhật ký', () => {
  beforeEach(() => {
    join('An', 1);
    join('Bình', 2);
  });

  it('đổi chủ ô: không được trong SELECT; được ở pha khác và ghi nhật ký', () => {
    expect(room.setCellOwner(0, 1)).toEqual({ ok: false, error: 'WRONG_PHASE' });
    must(room.startBoard(BANK, 2));
    expect(room.setCellOwner(c(0, 0), 1)).toEqual({ ok: false, error: 'WRONG_PHASE' });
    tick();
    expect(room.setCellOwner(99, 1)).toEqual({ ok: false, error: 'BAD_REQUEST' });
    expect(room.setCellOwner(c(0, 0), 9)).toEqual({ ok: false, error: 'BAD_REQUEST' });
    must(room.setCellOwner(c(0, 0), 2));
    expect(room.publicGame().board!.owners[c(0, 0)]).toBe(2);
    expect(room.publicGame().board!.standings.find((s) => s.teamId === 2)!.score).toBe(4);
    must(room.setCellOwner(startCell(1), null));
    expect(room.log().map((e) => e.text)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Admin đổi chủ ô #18 (0,0): ô trống → Nhóm 2'),
        expect.stringMatching(/^Admin đổi chủ ô #\d+ \(0,-3\): Nhóm 1 → ô trống$/),
      ]),
    );
  });

  it('nhật ký ghi mục tiêu, kết quả từng ô (chiếm/phòng thủ) và đáp án các nhóm', () => {
    must(room.startBoard(BANK, 2));
    const sel = room.select!.roundId;
    must(room.vote(ids['An']!, sel, OUTER_RING[1]!));
    lockIfOpen('An', sel);
    tick();
    const q = room.question!;
    time += 2_345;
    must(room.vote(ids['An']!, q.roundId, answer()));
    lockIfOpen('An', q.roundId);
    tick();
    const texts = room.log().map((e) => e.text);
    expect(texts).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^Lượt 1 — mục tiêu: Nhóm 1 → ô #\d+ \(1,-3\); Nhóm 2 → bỏ lượt$/),
        expect.stringMatching(/^Lượt 1 — đáp án ([A-D]): Nhóm 1 \1 ✓ \(2345 ms\); Nhóm 2 — ✗ \(hết giờ\)$/),
        expect.stringMatching(/^Lượt 1: Nhóm 1 chiếm ô trống/),
      ]),
    );
    expect(room.log().every((e, i, all) => i === 0 || e.id > all[i - 1]!.id)).toBe(true);
  });
});

describe('Room — lưu và khôi phục', () => {
  it('khôi phục giữa câu hỏi: đúng pha, giữ phiếu, tạm dừng tại lúc lưu, tiếp tục chạy đúng thời gian còn lại', () => {
    join('An', 1);
    join('Bình', 2);
    must(room.startBoard(BANK, 3));
    tick();
    const q = room.question!;
    time += 5_000;
    must(room.vote(ids['An']!, q.roundId, answer()));
    lockIfOpen('An', q.roundId);
    const snap = JSON.parse(JSON.stringify(room.toSnapshot())) as RoomSnapshot;
    expect(snap.savedAt).toBe(time);

    time += 120_000; // server tắt 2 phút
    const restored = Room.fromSnapshot(snap, () => time, TIMING);
    expect(restored.phase).toBe('BOARD_QUESTION');
    expect(restored.pausedAt).toBe(snap.savedAt);
    expect(restored.nextDeadline()).toBeNull();
    expect(restored.snapshot().teams[0]!.players[0]).toMatchObject({ name: 'An', online: false });
    // Người chơi vào lại bằng playerId: giữ nhóm.
    expect(restored.join({ playerId: ids['Bình'] })).toMatchObject({ ok: true, teamId: 2 });
    expect(restored.publicQuestion()!.locked.map((l) => [l.teamId, l.lockedAfterMs])).toEqual([[1, 5_000]]);
    expect(restored.log().at(-1)!.text).toContain('Server khởi động lại');

    must(restored.resume());
    // Còn 15 s như lúc lưu.
    expect(restored.nextDeadline()).toBe(time + 15_000);
    room = restored;
    time += 15_000;
    must(room.advance(BANK));
    expect(room.phase).toBe('BOARD_REVEAL');
    expect(room.publicGame().board!.standings.find((s) => s.teamId === 1)!.correct).toBe(1);
  });

  it('khôi phục giữa Quả Bom giữ nguyên ngòi (thời gian còn lại) và số câu đã hỏi', () => {
    join('An', 1);
    must(room.startBoard(BANK, 1));
    tick();
    tick();
    tick();
    must(room.startBombs(BANK, 2));
    time += 7_000;
    const snap = JSON.parse(JSON.stringify(room.toSnapshot())) as RoomSnapshot;
    expect(snap.bomb!.fuse.remainingMs).toBe(30_000); // file trên server có ngòi
    time += 1_000_000;
    const restored = Room.fromSnapshot(snap, () => time, TIMING);
    must(restored.resume());
    // Câu bom còn 5 s; ngòi còn 23 s.
    expect(restored.nextDeadline()).toBe(time + 5_000);
    expect(restored.publicGame().bomb).toMatchObject({ bombNumber: 1, totalBombs: 2, holder: 1, burning: true });
  });

  it('LOBBY không có đồng hồ → khôi phục không tạm dừng', () => {
    join('An', 3);
    const restored = Room.fromSnapshot(room.toSnapshot(), () => time, TIMING);
    expect(restored.pausedAt).toBeNull();
    expect(restored.phase).toBe('LOBBY');
    expect(restored.join({ name: 'Bảo', teamId: 3 })).toMatchObject({ ok: true });
    expect(restored.snapshot().teams[2]!.players.map((p) => p.name)).toEqual(['An', 'Bảo']);
  });
});
