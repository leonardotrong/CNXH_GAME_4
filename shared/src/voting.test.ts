import { describe, expect, it } from 'vitest';
import { canLock, resolveTeamChoice, tallyVotes, type Ballot } from './voting';

const b = (playerId: string, option: number, castAt: number): Ballot => ({ playerId, option, castAt });

describe('resolveTeamChoice', () => {
  it('không có phiếu → null', () => {
    expect(resolveTeamChoice([], 'cap')).toBeNull();
  });

  it('một phiếu → phương án đó', () => {
    expect(resolveTeamChoice([b('a', 2, 1)], null)).toBe(2);
  });

  it('đa số tuyệt đối thắng, kể cả khi đội trưởng bầu khác', () => {
    expect(resolveTeamChoice([b('a', 1, 1), b('b', 1, 2), b('cap', 3, 0)], 'cap')).toBe(1);
  });

  it('đa số tương đối (không quá nửa) vẫn thắng', () => {
    const ballots = [b('a', 0, 1), b('b', 0, 2), b('c', 1, 3), b('d', 2, 4), b('e', 3, 5)];
    expect(resolveTeamChoice(ballots, null)).toBe(0);
  });

  it('hòa, đội trưởng bầu một phương án đang hòa → theo đội trưởng', () => {
    const ballots = [b('a', 0, 1), b('b', 0, 2), b('cap', 2, 10), b('c', 2, 11)];
    expect(resolveTeamChoice(ballots, 'cap')).toBe(2);
  });

  it('hòa, đội trưởng bầu phương án thua → phương án đạt số phiếu sớm nhất', () => {
    // 0 đạt 2 phiếu lúc 5; 1 đạt 2 phiếu lúc 4 → chọn 1
    const ballots = [b('a', 0, 1), b('b', 0, 5), b('c', 1, 2), b('d', 1, 4), b('cap', 3, 0)];
    expect(resolveTeamChoice(ballots, 'cap')).toBe(1);
  });

  it('hòa, đội trưởng chưa bỏ phiếu → phương án đạt số phiếu sớm nhất', () => {
    const ballots = [b('a', 0, 1), b('b', 1, 2), b('c', 1, 3), b('d', 0, 4)];
    expect(resolveTeamChoice(ballots, 'cap')).toBe(1);
  });

  it('hòa, không có đội trưởng (null) → phương án đạt số phiếu sớm nhất', () => {
    expect(resolveTeamChoice([b('a', 3, 7), b('b', 2, 8)], null)).toBe(3);
  });

  it('đổi phiếu: thời điểm tính theo lần bỏ phiếu gần nhất', () => {
    // a bầu 0 lúc 1 nhưng đổi sang 1 lúc 9; b bầu 0 lúc 5 → 0 đạt 1 phiếu lúc 5, 1 đạt 1 phiếu lúc 9
    const ballots = [b('a', 1, 9), b('b', 0, 5)];
    expect(resolveTeamChoice(ballots, null)).toBe(0);
  });

  it('hòa ba phương án, đội trưởng bầu phương án đang hòa', () => {
    const ballots = [b('a', 0, 1), b('b', 1, 2), b('cap', 2, 3)];
    expect(resolveTeamChoice(ballots, 'cap')).toBe(2);
  });

  it('hòa ba phương án, không có phiếu đội trưởng → sớm nhất', () => {
    const ballots = [b('a', 2, 3), b('b', 1, 2), b('c', 0, 4)];
    expect(resolveTeamChoice(ballots, 'x')).toBe(1);
  });

  it('cùng thời điểm tuyệt đối → phương án chỉ số nhỏ hơn (xác định)', () => {
    expect(resolveTeamChoice([b('a', 3, 1), b('b', 1, 1)], null)).toBe(1);
  });
});

describe('canLock — quá nửa số thành viên online đã bỏ phiếu', () => {
  const online = ['a', 'b', 'c', 'd'];

  it('đúng một nửa → chưa được', () => {
    expect(canLock(online, [b('a', 0, 1), b('b', 0, 1)])).toBe(false);
  });
  it('quá nửa → được', () => {
    expect(canLock(online, [b('a', 0, 1), b('b', 0, 1), b('c', 1, 1)])).toBe(true);
  });
  it('số lẻ: 3/5 được, 2/5 chưa', () => {
    const five = ['a', 'b', 'c', 'd', 'e'];
    expect(canLock(five, [b('a', 0, 1), b('b', 0, 1)])).toBe(false);
    expect(canLock(five, [b('a', 0, 1), b('b', 0, 1), b('c', 0, 1)])).toBe(true);
  });
  it('phiếu của người đang offline không tính', () => {
    expect(canLock(['a', 'b'], [b('a', 0, 1), b('offline', 0, 1)])).toBe(false);
  });
  it('nhóm không ai online → không chốt được', () => {
    expect(canLock([], [b('a', 0, 1)])).toBe(false);
  });
  it('một người online đã bầu → được', () => {
    expect(canLock(['a'], [b('a', 0, 1)])).toBe(true);
  });
});

describe('tallyVotes', () => {
  it('đếm theo phương án, bỏ qua chỉ số ngoài phạm vi', () => {
    expect(tallyVotes([b('a', 0, 1), b('b', 0, 1), b('c', 3, 1), b('d', 9, 1)], 4)).toEqual([2, 0, 0, 1]);
  });
});
