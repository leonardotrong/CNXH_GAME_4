import { beforeEach, describe, expect, it } from 'vitest';
import { TEAM_IDS, cellAt, cellsOf, startCell, type Question, type Rng } from '@cnxh/shared';
import { Room, type RoomTiming } from './room';

const BANK: Question[] = [
  { id: 'b1', pool: 'board', topic: 't', type: 'mcq', prompt: 'Câu 1?', options: ['Đ', 'S1', 'S2', 'S3'], answerIndex: 0, explanation: 'x' },
  { id: 'b2', pool: 'board', topic: 't', type: 'mcq', prompt: 'Câu 2?', options: ['Đ', 'S1', 'S2', 'S3'], answerIndex: 0, explanation: 'x' },
  ...[1, 2, 3, 4, 5, 6].map(
    (i): Question => ({ id: `m${i}`, pool: 'bomb', topic: 't', type: 'tf', prompt: `Bom ${i}?`, options: ['Đúng', 'Sai'], answerIndex: 0, explanation: 'y' }),
  ),
];
const BOARD_ONLY = BANK.filter((q) => q.pool === 'board');
const c = (q: number, r: number) => cellAt(q, r)!;

const timingFor = (fuseMs: number): Partial<RoomTiming> => ({
  select: 15_000,
  board: 20_000,
  boardReveal: 10_000,
  bomb: 12_000,
  bombReveal: 8_000,
  bombPass: 10_000,
  bombExplode: 6_000,
  fuseMin: fuseMs,
  fuseMax: fuseMs,
});

function must<T extends { ok: boolean }>(res: T): Extract<T, { ok: true }> {
  if (!res.ok) throw new Error(JSON.stringify(res));
  return res as Extract<T, { ok: true }>;
}

/** Một phòng + người chơi; mọi phòng dùng chung đồng hồ giả `time`. */
let time = 0;
function makeRoom(fuseMs: number) {
  const room = new Room('1234', () => time, timingFor(fuseMs));
  const ids: Record<string, string> = {};
  for (const [name, teamId] of [['An', 1], ['Bình', 2], ['Chi', 4]] as const) {
    const res = must(room.join({ name, teamId }));
    ids[name] = res.playerId;
  }
  const roundId = () =>
    room.phase === 'BOARD_SELECT' ? room.select!.roundId : room.phase === 'BOMB_PASS' ? room.pass!.roundId : room.question!.roundId;
  const vote = (name: string, option: number) => must(room.vote(ids[name]!, roundId(), option));
  const voteAndLock = (name: string, option: number) => {
    // Nhóm một người online: phiếu đã tự chốt (GAME_SPEC 2.2).
    if (!vote(name, option).locked) must(room.lock(ids[name]!, roundId()));
  };
  const answer = () => room.question!.question.answerIndex;
  const wrong = () => 1 - answer();
  /** Bàn Cờ 1 lượt: nhóm 1 chiếm thêm 1 ô → dẫn đầu; sang BOMB_INTRO. */
  const playBoard = (rng?: Rng) => {
    must(room.startBoard(BANK, 1));
    voteAndLock('An', c(1, -3));
    must(room.endSelect(BANK, rng));
    voteAndLock('An', room.question!.question.answerIndex);
    must(room.endBoardQuestion());
    must(room.advanceTurn(rng));
  };
  return { room, ids, vote, voteAndLock, answer, wrong, playBoard };
}

let r: ReturnType<typeof makeRoom>;
let room: Room;
function setup(fuseMs: number) {
  r = makeRoom(fuseMs);
  room = r.room;
  r.playBoard();
}

beforeEach(() => {
  time = 10_000;
});

describe('Room — Quả Bom Tham Nhũng', () => {
  it('BOMB_INTRO: nhóm dẫn đầu cầm quả 1; admin bắt đầu; chỉ nhóm cầm bom trả lời', () => {
    setup(30_000);
    expect(room.phase).toBe('BOMB_INTRO');
    expect(room.publicGame().bomb).toMatchObject({ bombNumber: 1, totalBombs: 3, holder: 1, burning: false, explosions: [] });
    expect(room.bombDeadline()).toBeNull();
    expect(room.startBombs(BOARD_ONLY)).toEqual({ ok: false, error: 'NO_QUESTIONS_IN_POOL' });

    must(room.startBombs(BANK, 2));
    const game = room.publicGame();
    expect(game.phase).toBe('BOMB_QUESTION');
    expect(game.bomb).toMatchObject({ totalBombs: 2, holder: 1, burning: true });
    expect(game.phaseEndsAt).toBe(room.question!.endsAt); // hạn câu hỏi, không phải hạn ngòi
    expect(room.question!.teamIds).toEqual([1]);
    expect(room.question!.question.pool).toBe('bomb');
    expect(room.vote(r.ids['Bình']!, room.question!.roundId, 0)).toEqual({ ok: false, error: 'NOT_IN_ROUND' });
    expect(room.teamQuestion(2)).toBeNull();
    expect(room.startBombs(BANK)).toEqual({ ok: false, error: 'WRONG_PHASE' });
  });

  it('ngòi CHỈ trừ trong BOMB_QUESTION: dừng trong REVEAL và PASS', () => {
    setup(20_000);
    must(room.startBombs(BANK, 3)); // câu 1 mở lúc 10 000
    expect(room.bombDeadline()).toBe(22_000); // câu hết giờ trước ngòi

    // Nhóm 1 trả lời đúng sau 5 s (ngòi cháy 5 s).
    time = 15_000;
    r.voteAndLock('An', r.answer());
    expect(room.allLocked()).toBe(true);
    expect(room.endBombQuestion()).toEqual({ ok: true, exploded: false });
    expect(room.phase).toBe('BOMB_REVEAL');
    expect(room.publicGame().bomb!.burning).toBe(false);
    expect(room.publicGame().phaseEndsAt).toBe(23_000);
    expect(room.publicQuestion()!.reveal!.results[0]).toMatchObject({ teamId: 1, correct: true });
    expect(room.match!.stats[1]!.correct).toBe(2); // câu bom tính vào tiêu chí phụ
    expect(room.bombDeadline()).toBeNull();

    // REVEAL 8 s → PASS (10 s): không trừ ngòi.
    time = 23_000;
    must(room.afterBombReveal(BANK));
    expect(room.phase).toBe('BOMB_PASS');
    expect(room.publicGame().phaseEndsAt).toBe(33_000);
    expect(room.publicGame().bomb!.pass).toMatchObject({ holder: 1, validTargets: [2, 4], status: 'open', choice: null });
    expect(room.teamPass(1)!.validTargets).toEqual([2, 4]);
    expect(room.teamPass(2)).toBeNull();
    time = 32_000;
    r.voteAndLock('An', 2);
    expect(room.passAllLocked()).toBe(true);
    must(room.endPass(BANK));

    // Nhóm 2 cầm bom; ngòi còn 15 s.
    expect(room.phase).toBe('BOMB_QUESTION');
    expect(room.publicGame().bomb).toMatchObject({ holder: 2, passedFrom: 1, lastPass: { from: 1, to: 2, random: false }, burning: true });
    expect(room.question!.teamIds).toEqual([2]);
    expect(room.bombDeadline()).toBe(44_000);

    // Hết giờ không trả lời (cháy 12 s, còn 3 s) → REVEAL → câu mới NGAY cho nhóm 2 (không qua PASS).
    time = 44_000;
    expect(room.endBombQuestion()).toEqual({ ok: true, exploded: false });
    expect(room.publicQuestion()!.reveal!.results[0]).toMatchObject({ teamId: 2, correct: false, lockedBy: 'timeout' });
    time = 52_000;
    must(room.afterBombReveal(BANK));
    expect(room.phase).toBe('BOMB_QUESTION');
    expect(room.question!.teamIds).toEqual([2]);
    expect(room.bombDeadline()).toBe(55_000); // ngòi hết trước câu hỏi

    // Tổng ngòi đã cháy = 5 + 12 + 3 = 20 s, dù đã trôi 45 s.
    time = 55_000;
    expect(room.endBombQuestion()).toEqual({ ok: true, exploded: true });
    const game = room.publicGame();
    expect(game.phase).toBe('BOMB_EXPLODE');
    expect(game.phaseEndsAt).toBe(61_000);
    expect(game.bomb!.explosions).toEqual([{ bombNumber: 1, teamId: 2, cells: [startCell(2)] }]);
    expect(game.board!.owners[startCell(2)]).toBeNull();
    expect(room.question).toBeNull();
  });

  it('không chuyền ngược cho nhóm vừa chuyền cho mình', () => {
    setup(60_000);
    must(room.startBombs(BANK));
    r.voteAndLock('An', r.answer());
    must(room.endBombQuestion());
    must(room.afterBombReveal(BANK));
    r.voteAndLock('An', 2);
    must(room.endPass(BANK));

    r.voteAndLock('Bình', r.answer());
    must(room.endBombQuestion());
    must(room.afterBombReveal(BANK));
    expect(room.pass!.validTargets).toEqual([4]);
    expect(room.vote(r.ids['Bình']!, room.pass!.roundId, 1)).toEqual({ ok: false, error: 'BAD_OPTION' });
    expect(room.vote(r.ids['Bình']!, room.pass!.roundId, 2)).toEqual({ ok: false, error: 'BAD_OPTION' });
    r.voteAndLock('Bình', 4);
    must(room.endPass(BANK));
    expect(room.publicGame().bomb).toMatchObject({ holder: 4, passedFrom: 2 });

    r.voteAndLock('Chi', r.answer());
    must(room.endBombQuestion());
    must(room.afterBombReveal(BANK));
    expect(room.pass!.validTargets).toEqual([1]);
  });

  it('câu trả lời sai: REVEAL rồi câu mới cho cùng nhóm, không chuyền', () => {
    setup(60_000);
    must(room.startBombs(BANK));
    const first = room.question!.roundId;
    r.voteAndLock('An', r.wrong());
    must(room.endBombQuestion());
    expect(room.phase).toBe('BOMB_REVEAL');
    must(room.afterBombReveal(BANK));
    expect(room.phase).toBe('BOMB_QUESTION');
    expect(room.question!.roundId).not.toBe(first);
    expect(room.publicGame().bomb!.holder).toBe(1);
  });

  it('hết giờ PASS: có phiếu → theo phiếu; không phiếu → server chọn ngẫu nhiên', () => {
    setup(60_000);
    must(room.startBombs(BANK));
    r.voteAndLock('An', r.answer());
    must(room.endBombQuestion());
    must(room.afterBombReveal(BANK));
    r.vote('An', 2); // bỏ phiếu nhưng không chốt
    time = room.pass!.endsAt;
    must(room.endPass(BANK, () => 0.99));
    expect(room.publicGame().bomb!.lastPass).toEqual({ from: 1, to: 2, random: false });

    r.voteAndLock('Bình', r.answer());
    must(room.endBombQuestion());
    must(room.afterBombReveal(BANK));
    time = room.pass!.endsAt;
    must(room.endPass(BANK, () => 0));
    expect(room.publicGame().bomb!.lastPass).toEqual({ from: 2, to: 4, random: true });
  });

  it('nổ giữa câu: câu bị hủy, không công bố đáp án, không tính thống kê', () => {
    setup(3_000);
    must(room.startBombs(BANK));
    const roundId = room.question!.roundId;
    r.vote('An', r.answer());
    const before = room.match!.stats[1];
    time = 13_000;
    expect(room.bombDeadline()).toBe(13_000);
    expect(room.endBombQuestion()).toEqual({ ok: true, exploded: true });
    expect(room.publicQuestion()).toBeNull();
    expect(room.teamQuestion(1)).toBeNull();
    expect(room.match!.stats[1]).toEqual(before);
    expect(room.vote(r.ids['An']!, roundId, 0)).toEqual({ ok: false, error: 'NO_QUESTION' });
    expect(room.publicGame().phase).toBe('BOMB_EXPLODE');
  });

  it('chốt đúng mili-giây hết ngòi → nổ; sớm hơn 1 ms → không nổ', () => {
    setup(3_000);
    must(room.startBombs(BANK));
    time = 13_000;
    r.voteAndLock('An', r.answer());
    expect(room.endBombQuestion()).toEqual({ ok: true, exploded: true });

    setup(3_000);
    must(room.startBombs(BANK));
    time = 12_999;
    r.voteAndLock('An', r.answer());
    expect(room.endBombQuestion()).toEqual({ ok: true, exploded: false });
  });

  it('nổ mất 2 ô ngẫu nhiên; quả sau do nhóm dẫn đầu (trừ nhóm vừa nổ) cầm; hết bom → SUMMARY', () => {
    setup(1_000);
    // Nhóm 1 có 4 ô.
    const owners = [...room.match!.board.owners];
    owners[c(0, -2)] = 1;
    owners[c(1, -2)] = 1;
    room.match = { ...room.match!, board: { ...room.match!.board, owners } };
    const cellsBefore = cellsOf(room.match.board, 1);
    expect(cellsBefore).toHaveLength(4);

    must(room.startBombs(BANK, 3));
    time += 1_000;
    expect(room.endBombQuestion()).toMatchObject({ exploded: true });
    const [boom] = room.publicGame().bomb!.explosions;
    expect(boom!.teamId).toBe(1);
    expect(boom!.cells).toHaveLength(2);
    for (const id of boom!.cells) expect(cellsBefore).toContain(id);
    expect(cellsOf(room.match.board, 1)).toHaveLength(2);

    // Quả 2: nhóm 1 vẫn dẫn đầu (2 ô) nhưng vừa nổ → nhóm xếp ngay sau (nhóm 2).
    must(room.afterExplode(BANK));
    expect(room.phase).toBe('BOMB_QUESTION');
    expect(room.publicGame().bomb).toMatchObject({ bombNumber: 2, holder: 2, passedFrom: null, lastPass: null, burning: true });
    expect(room.bombDeadline()).toBe(time + 1_000); // ngòi mới
    time += 1_000;
    must(room.endBombQuestion());
    expect(cellsOf(room.match.board, 2)).toEqual([]); // còn 1 ô → mất hết

    // Quả 3: nhóm vừa nổ là nhóm 2 → nhóm dẫn đầu (nhóm 1) cầm.
    must(room.afterExplode(BANK));
    expect(room.publicGame().bomb).toMatchObject({ bombNumber: 3, holder: 1 });
    time += 1_000;
    must(room.endBombQuestion());
    must(room.afterExplode(BANK));
    const end = room.publicGame();
    expect(end.phase).toBe('SUMMARY');
    expect(end.phaseEndsAt).toBeNull();
    expect(end.bomb!.explosions.map((e) => [e.bombNumber, e.teamId])).toEqual([[1, 1], [2, 2], [3, 1]]);
    expect(end.board!.standings[0]!.teamId).toBe(4);

    // Chơi lại từ SUMMARY.
    must(room.startBoard(BANK, 1));
    expect(room.publicGame().bomb).toBeNull();
  });

  it('bỏ qua câu bom lỗi: câu mới, ngòi cháy liên tục', () => {
    setup(10_000);
    must(room.startBombs(BANK));
    const first = room.question!.roundId;
    time = 14_000;
    must(room.replaceBombQuestion(BANK));
    expect(room.question!.roundId).not.toBe(first);
    expect(room.question!.endsAt).toBe(26_000);
    expect(room.bombDeadline()).toBe(20_000);
  });

  it('chuyển pha sai thứ tự bị từ chối', () => {
    setup(30_000);
    expect(room.endBombQuestion()).toEqual({ ok: false, error: 'WRONG_PHASE' });
    expect(room.afterBombReveal(BANK)).toEqual({ ok: false, error: 'WRONG_PHASE' });
    expect(room.endPass(BANK)).toEqual({ ok: false, error: 'WRONG_PHASE' });
    expect(room.afterExplode(BANK)).toEqual({ ok: false, error: 'WRONG_PHASE' });
    expect(room.replaceBombQuestion(BANK)).toEqual({ ok: false, error: 'WRONG_PHASE' });
  });
});

/** PRNG có hạt giống để hai phòng rút câu hỏi giống hệt nhau. */
function seeded(seed: number): Rng {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('ngòi không lộ, kể cả gián tiếp', () => {
  it('hai phòng chỉ khác độ dài ngòi: mọi dữ liệu gửi client giống hệt nhau cho tới khi nổ', () => {
    const rooms = [makeRoom(20_000), makeRoom(45_000)];
    const rngs = [seeded(42), seeded(42)];

    /** Mọi thứ server có thể gửi xuống client, với playerId thay bằng tên. */
    const view = (i: number) => {
      const { room: rm, ids } = rooms[i]!;
      let json = JSON.stringify({
        game: rm.publicGame(),
        question: rm.publicQuestion(),
        teams: TEAM_IDS.map((t) => [rm.teamQuestion(t), rm.teamSelect(t), rm.teamPass(t)]),
      });
      for (const [name, id] of Object.entries(ids)) json = json.split(id).join(name);
      return json;
    };
    const both = (step: (x: ReturnType<typeof makeRoom>, rng: Rng) => unknown) => {
      const results = rooms.map((x, i) => JSON.stringify(step(x, rngs[i]!)));
      expect(results[0]).toBe(results[1]);
      expect(view(0)).toBe(view(1));
    };

    both((x, rng) => x.playBoard(rng));
    both((x, rng) => x.room.startBombs(BANK, 3, rng));
    time += 5_000;
    both((x) => x.voteAndLock('An', x.answer()));
    both((x, rng) => x.room.endBombQuestion(rng));
    time += 8_000;
    both((x, rng) => x.room.afterBombReveal(BANK, rng));
    time += 4_000;
    both((x) => x.vote('An', 4));
    time += 6_000;
    both((x, rng) => x.room.endPass(BANK, rng));
    time += 12_000; // nhóm 4 không trả lời → hết giờ
    both((x, rng) => x.room.endBombQuestion(rng));
    time += 8_000;
    both((x, rng) => x.room.afterBombReveal(BANK, rng));
    time += 1_999;
    both((x) => x.voteAndLock('Chi', x.wrong()));
    both((x, rng) => x.room.endBombQuestion(rng)); // ngòi đã cháy 18 999 ms ở cả hai phòng
    expect(view(0)).not.toMatch(/fuse|remaining|burningSince|deadline|20000|45000/i);

    // Chỉ hàm nội bộ của server mới phân biệt được hai phòng.
    time += 8_000;
    both((x, rng) => x.room.afterBombReveal(BANK, rng));
    expect(rooms[0]!.room.bombDeadline()).not.toBe(rooms[1]!.room.bombDeadline());
  });
});
