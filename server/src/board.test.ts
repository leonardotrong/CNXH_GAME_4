import { beforeEach, describe, expect, it } from 'vitest';
import { cellAt, startCell, type Question } from '@cnxh/shared';
import { Room } from './room';

const BANK: Question[] = [
  { id: 'b1', pool: 'board', topic: 't', type: 'mcq', prompt: 'Câu 1?', options: ['Đ', 'S1', 'S2', 'S3'], answerIndex: 0, explanation: 'x' },
  { id: 'b2', pool: 'board', topic: 't', type: 'mcq', prompt: 'Câu 2?', options: ['Đ', 'S1', 'S2', 'S3'], answerIndex: 0, explanation: 'x' },
];
const c = (q: number, r: number) => cellAt(q, r)!;

let time = 0;
let room: Room;
const ids: Record<string, string> = {};

function join(name: string, teamId: number) {
  const res = room.join({ name, teamId });
  if (!res.ok) throw new Error(res.error);
  ids[name] = res.playerId;
}
function must<T extends { ok: boolean }>(res: T): T {
  if (!res.ok) throw new Error(JSON.stringify(res));
  return res;
}
/** Người chơi bỏ phiếu rồi (nếu là đội trưởng) chốt vòng đang mở. */
function voteAndLock(name: string, option: number) {
  const roundId = room.phase === 'BOARD_SELECT' ? room.select!.roundId : room.question!.roundId;
  must(room.vote(ids[name]!, roundId, option));
  must(room.lock(ids[name]!, roundId));
}
const answer = () => room.question!.question.answerIndex;
const wrong = () => (answer() + 1) % 4;

beforeEach(() => {
  time = 10_000;
  room = new Room('1234', () => time, { select: 15_000, board: 20_000, boardReveal: 10_000 });
  join('An', 1);
  join('Bình', 2);
  join('Chi', 4);
});

describe('Room — Bàn Cờ Quyền Lực', () => {
  it('bắt đầu: chỉ nhóm có người nhận ô xuất phát, vào SELECT lượt 1', () => {
    must(room.startBoard(BANK, 3));
    const game = room.publicGame();
    expect(game.phase).toBe('BOARD_SELECT');
    expect(game.phaseEndsAt).toBe(25_000);
    expect(game.board!.turn).toBe(1);
    expect(game.board!.totalTurns).toBe(3);
    expect(game.board!.owners[startCell(1)]).toBe(1);
    expect(game.board!.owners[startCell(3)]).toBeNull();
    expect(game.board!.targets).toBeNull();
    expect(room.teamSelect(1)!.validTargets).toContain(c(1, -3));
  });

  it('không bắt đầu khi đang chơi hoặc kho board rỗng', () => {
    expect(room.startBoard([], 3)).toEqual({ ok: false, error: 'NO_QUESTIONS_IN_POOL' });
    must(room.startBoard(BANK, 3));
    expect(room.startBoard(BANK, 3)).toEqual({ ok: false, error: 'WRONG_PHASE' });
  });

  it('người chơi không tự đổi nhóm sau khi trận bắt đầu', () => {
    must(room.startBoard(BANK, 3));
    expect(room.changeTeam(ids['An']!, 2)).toEqual({ ok: false, error: 'LOBBY_CLOSED' });
  });

  it('chỉ nhận ô hợp lệ; mục tiêu chỉ công khai sau khi SELECT đóng', () => {
    must(room.startBoard(BANK, 3));
    const roundId = room.select!.roundId;
    expect(room.vote(ids['Bình']!, roundId, c(0, -3))).toEqual({ ok: false, error: 'BAD_OPTION' });
    voteAndLock('An', c(1, -3));
    expect(room.publicGame().board!.targets).toBeNull();
    expect(room.publicGame().board!.select!.targets).toBeNull();
    expect(room.publicGame().board!.select!.locked).toEqual([1]);
    expect(JSON.stringify(room.publicGame())).not.toContain('ballots');
  });

  it('hai lượt đầy đủ: SELECT → QUESTION → REVEAL → lượt kế → kết thúc', () => {
    must(room.startBoard(BANK, 2));

    // Lượt 1 — SELECT hết giờ: nhóm 4 không bỏ phiếu → bỏ lượt.
    voteAndLock('An', c(1, -3));
    time += 2000;
    voteAndLock('Bình', c(2, -3));
    expect(room.selectAllLocked()).toBe(false);
    time = 25_000;
    must(room.endSelect(BANK));
    expect(room.phase).toBe('BOARD_QUESTION');
    expect(room.publicGame().board!.targets).toMatchObject({ 1: c(1, -3), 2: c(2, -3), 4: null });
    expect(room.question!.teamIds).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(room.publicGame().phaseEndsAt).toBe(45_000);

    // Câu hỏi: nhóm 1 đúng, nhóm 2 sai.
    time += 3000;
    voteAndLock('An', answer());
    voteAndLock('Bình', wrong());
    expect(room.publicGame().board!.outcome).toBeNull(); // chưa đóng → chưa có kết quả
    must(room.endBoardQuestion());
    let game = room.publicGame();
    expect(game.phase).toBe('BOARD_REVEAL');
    expect(game.phaseEndsAt).toBe(time + 10_000);
    expect(game.board!.owners[c(1, -3)]).toBe(1);
    expect(game.board!.owners[c(2, -3)]).toBeNull();
    expect(game.board!.outcome!.cells.map((x) => [x.cellId, x.result])).toEqual([
      [c(1, -3), 'captured'],
      [c(2, -3), 'failed'],
    ]);
    expect(game.board!.standings[0]).toMatchObject({ teamId: 1, score: 2, correct: 1, rank: 1 });

    // Lượt 2 — SELECT đóng sớm khi mọi nhóm có người đã chốt.
    must(room.advanceTurn());
    game = room.publicGame();
    expect(game.phase).toBe('BOARD_SELECT');
    expect(game.board!.turn).toBe(2);
    expect(game.board!.targets).toBeNull();
    expect(game.board!.outcome).toBeNull();
    voteAndLock('An', c(2, -3));
    voteAndLock('Bình', c(3, -2));
    voteAndLock('Chi', c(0, 2));
    expect(room.selectAllLocked()).toBe(true);
    must(room.endSelect(BANK));
    voteAndLock('An', answer());
    voteAndLock('Bình', answer());
    voteAndLock('Chi', answer());
    expect(room.allLocked()).toBe(true);
    must(room.endBoardQuestion());
    expect(room.match!.board.owners[c(2, -3)]).toBe(1);
    expect(room.match!.board.owners[c(3, -2)]).toBe(2);
    expect(room.match!.board.owners[c(0, 2)]).toBe(4);

    // Hết N lượt → kết thúc Bàn Cờ (Giai đoạn 4 sẽ chuyển sang Quả Bom).
    must(room.advanceTurn());
    game = room.publicGame();
    expect(game.phase).toBe('SUMMARY');
    expect(game.board!.standings.slice(0, 3).map((s) => [s.teamId, s.score])).toEqual([[1, 3], [2, 2], [4, 2]]);
    expect(room.advanceTurn()).toEqual({ ok: false, error: 'WRONG_PHASE' });
  });

  it('chuyển pha sai thứ tự bị từ chối', () => {
    expect(room.endSelect(BANK)).toEqual({ ok: false, error: 'WRONG_PHASE' });
    must(room.startBoard(BANK, 3));
    expect(room.endBoardQuestion()).toEqual({ ok: false, error: 'WRONG_PHASE' });
    expect(room.advanceTurn()).toEqual({ ok: false, error: 'WRONG_PHASE' });
    expect(room.replaceBoardQuestion(BANK)).toEqual({ ok: false, error: 'WRONG_PHASE' });
  });

  it('bỏ qua câu lỗi: đổi câu (roundId mới), giữ nguyên mục tiêu', () => {
    must(room.startBoard(BANK, 3));
    voteAndLock('An', c(1, -3));
    must(room.endSelect(BANK));
    const first = room.question!.roundId;
    must(room.replaceBoardQuestion(BANK));
    expect(room.question!.roundId).not.toBe(first);
    expect(room.question!.status).toBe('open');
    expect(room.match!.targets![1]).toBe(c(1, -3));
    // Phiếu gửi cho câu cũ bị từ chối.
    expect(room.vote(ids['An']!, first, 0)).toEqual({ ok: false, error: 'NO_QUESTION' });
  });

  it('admin: chỉnh số lượt (không nhỏ hơn lượt hiện tại) và "Kết thúc sau lượt này"', () => {
    expect(room.setBoardTurns(5)).toEqual({ ok: false, error: 'WRONG_PHASE' });
    must(room.startBoard(BANK, 14));
    expect(room.setBoardTurns(0)).toEqual({ ok: true, totalTurns: 1 });
    expect(room.setBoardTurns(6)).toEqual({ ok: true, totalTurns: 6 });
    must(room.setEndAfterThisTurn(true));
    must(room.endSelect(BANK));
    must(room.endBoardQuestion());
    must(room.advanceTurn());
    expect(room.phase).toBe('SUMMARY');
  });

  it('bắt đầu lại từ SUMMARY: bàn cờ mới', () => {
    must(room.startBoard(BANK, 1));
    voteAndLock('An', c(1, -3));
    must(room.endSelect(BANK));
    voteAndLock('An', answer());
    must(room.endBoardQuestion());
    must(room.advanceTurn());
    expect(room.phase).toBe('SUMMARY');
    must(room.startBoard(BANK, 1));
    expect(room.match!.board.owners[c(1, -3)]).toBeNull();
    expect(room.match!.stats[1]).toEqual({ correct: 0, correctLockMs: 0 });
  });
});
