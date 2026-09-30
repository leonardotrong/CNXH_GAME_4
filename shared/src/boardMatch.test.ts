import { describe, expect, it } from 'vitest';
import { cellsOf, startCell } from './board';
import { c } from './boardFixtures';
import {
  DEFAULT_BOARD_TURNS,
  MAX_BOARD_TURNS,
  applyTurn,
  isFinalTurn,
  nextTurn,
  publicBoardView,
  setTotalTurns,
  startMatch,
  withTargets,
} from './boardMatch';
import { TEAM_IDS } from './lobby';
import { castVote, closeRound, lockTeam, openRound } from './questionRound';
import type { PresentedQuestion } from './questions';
import type { TeamContext } from './voteRound';

const question: PresentedQuestion = {
  questionId: 'q', pool: 'board', prompt: '?', options: ['a', 'b', 'c', 'd'], answerIndex: 1, explanation: 'e',
};
const ctx = (id: string): TeamContext => ({ memberIds: [id], onlineIds: [id], captainId: id });

/** Nhóm 1 trả lời đúng lúc 2000, các nhóm khác không trả lời. */
function closedRound() {
  let r = openRound({ roundId: 1, question, teamIds: TEAM_IDS, now: 1000, durationMs: 20_000 });
  for (const res of [castVote(r, 1, 'a', 1, 1500)]) if (res.ok) r = res.round;
  const locked = lockTeam(r, 1, 'a', ctx('a'), 2000);
  if (!locked.ok) throw new Error(locked.error);
  return closeRound(locked.round, { 1: ctx('a') }, 30_000);
}

describe('boardMatch', () => {
  it('bắt đầu: lượt 1, số lượt mặc định 14, bàn cờ đầu trận', () => {
    const m = startMatch([1, 2]);
    expect(m.turn).toBe(1);
    expect(m.totalTurns).toBe(DEFAULT_BOARD_TURNS);
    expect(cellsOf(m.board, 1)).toEqual([startCell(1)]);
    expect(cellsOf(m.board, 3)).toEqual([]);
  });

  it('số lượt được giới hạn hợp lý', () => {
    expect(startMatch([1], 0).totalTurns).toBe(1);
    expect(startMatch([1], 999).totalTurns).toBe(MAX_BOARD_TURNS);
    expect(startMatch([1], 'x').totalTurns).toBe(DEFAULT_BOARD_TURNS);
  });

  it('applyTurn: giải quyết theo mục tiêu đã chốt và cộng thống kê', () => {
    const m = applyTurn(withTargets(startMatch([1, 2]), { 1: c(1, -3), 2: null }), closedRound());
    expect(m.board.owners[c(1, -3)]).toBe(1);
    expect(m.outcome!.cells[0]).toMatchObject({ result: 'captured', newOwner: 1 });
    expect(m.stats[1]).toEqual({ correct: 1, correctLockMs: 1000 });
  });

  it('applyTurn từ chối câu hỏi chưa đóng', () => {
    const open = openRound({ roundId: 1, question, teamIds: [1], now: 0, durationMs: 1 });
    expect(() => applyTurn(startMatch([1]), open)).toThrow();
  });

  it('lượt cuối: đủ N lượt hoặc admin bấm "Kết thúc sau lượt này"', () => {
    let m = startMatch([1], 2);
    expect(isFinalTurn(m)).toBe(false);
    m = nextTurn(m);
    expect(m.turn).toBe(2);
    expect(isFinalTurn(m)).toBe(true);
    expect(isFinalTurn({ ...startMatch([1], 14), endAfterThisTurn: true })).toBe(true);
  });

  it('nextTurn xóa mục tiêu và kết quả lượt trước', () => {
    const m = nextTurn(applyTurn(withTargets(startMatch([1]), { 1: c(1, -3) }), closedRound()));
    expect(m.targets).toBeNull();
    expect(m.outcome).toBeNull();
    expect(m.board.owners[c(1, -3)]).toBe(1);
  });

  it('admin chỉnh N: không nhỏ hơn lượt đang chơi', () => {
    let m = nextTurn(nextTurn(startMatch([1], 14)));
    expect(setTotalTurns(m, 1).totalTurns).toBe(3);
    m = setTotalTurns(m, 8);
    expect(m.totalTurns).toBe(8);
  });

  it('dữ liệu công khai: có bảng xếp hạng cho cả 7 nhóm, không sửa được trạng thái gốc', () => {
    const m = startMatch([1, 2]);
    const view = publicBoardView(m, null);
    expect(view.standings).toHaveLength(7);
    view.owners[0] = 7;
    expect(m.board.owners[0]).toBe(1);
  });
});
