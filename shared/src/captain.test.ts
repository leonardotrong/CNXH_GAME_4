import { describe, expect, it } from 'vitest';
import {
  CAPTAIN_GRACE_MS,
  captainAfterEntry,
  captainSignal,
  effectiveCaptain,
  namedCaptainInfo,
  pickDesignatedCaptain,
  resolveDesignatedCaptain,
  type CaptainCandidate,
} from './captain';
import type { PublicTeam } from './lobby';

const on = (id: string, teamJoinSeq: number): CaptainCandidate => ({
  id, teamJoinSeq, online: true, offlineSince: null,
});
/** Thành viên online có tên là số nhóm (nhóm trưởng tự nhận). */
const named = (id: string, teamJoinSeq: number): CaptainCandidate => ({ ...on(id, teamJoinSeq), namedCaptain: true });
const off = (id: string, teamJoinSeq: number, offlineSince: number): CaptainCandidate => ({
  id, teamJoinSeq, online: false, offlineSince,
});

describe('captainSignal', () => {
  it('tên chỉ là số nhóm 1–7 → số nhóm đó', () => {
    for (const n of [1, 2, 3, 4, 5, 6, 7]) expect(captainSignal(String(n))).toBe(n);
  });

  it('chấp nhận "Nhóm"/"N"/"NT" phía trước, hoa thường, dấu, khoảng trắng, dấu câu', () => {
    for (const name of ['1', ' 1 ', '1.', '01', 'Nhóm 1', 'nhóm 1', 'NHÓM 1', 'nhom1', 'Nhom-1', 'N1', 'n 1', 'NT1', 'nt 1', 'N.1', 'Nhóm 1!']) {
      expect(captainSignal(name), name).toBe(1);
    }
  });

  it('chữ số toàn khổ và dấu tổ hợp (NFD) của bàn phím điện thoại', () => {
    expect(captainSignal('３')).toBe(3);
    expect(captainSignal('Nhóm 5'.normalize('NFD'))).toBe(5);
  });

  it('tên thật, tên kèm số, số ngoài 1–7 → null', () => {
    for (const name of ['', ' ', 'An', 'Nguyễn Văn An', '1 An', 'An 1', 'Nhóm 1 An', 'Nhóm trưởng 1', 'Nhóm', 'N', '0', '8', '10', '12', '1 2', 'Tổ 1']) {
      expect(captainSignal(name), name).toBeNull();
    }
  });
});

describe('pickDesignatedCaptain', () => {
  it('nhóm rỗng → null', () => {
    expect(pickDesignatedCaptain([])).toBeNull();
  });
  it('chọn người vào nhóm sớm nhất, không phụ thuộc thứ tự mảng', () => {
    expect(pickDesignatedCaptain([on('c', 9), on('a', 2), on('b', 5)])).toBe('a');
  });
  it('tính cả người đang offline', () => {
    expect(pickDesignatedCaptain([off('a', 1, 0), on('b', 2)])).toBe('a');
  });
  it('ưu tiên người có tên là số nhóm (vào sớm nhất trong số đó), dù vào sau', () => {
    expect(pickDesignatedCaptain([on('a', 1), named('c', 7), named('b', 4)])).toBe('b');
  });
});

describe('resolveDesignatedCaptain', () => {
  it('giữ đội trưởng hiện tại nếu còn trong nhóm (kể cả khi không phải người sớm nhất)', () => {
    expect(resolveDesignatedCaptain([on('a', 1), on('b', 2)], 'b')).toBe('b');
  });
  it('đội trưởng rời nhóm → người vào sớm nhất còn lại', () => {
    expect(resolveDesignatedCaptain([on('c', 7), on('b', 3)], 'a')).toBe('b');
  });
  it('chưa có đội trưởng → người đầu tiên vào', () => {
    expect(resolveDesignatedCaptain([on('a', 1)], null)).toBe('a');
  });
  it('nhóm rỗng → null', () => {
    expect(resolveDesignatedCaptain([], 'a')).toBeNull();
  });
  it('đội trưởng rời nhóm → ưu tiên người còn lại có tên là số nhóm', () => {
    expect(resolveDesignatedCaptain([on('b', 2), named('c', 5)], 'a')).toBe('c');
  });
  it('không quét lại cả nhóm: đội trưởng (vd. admin chọn) còn trong nhóm thì giữ dù có người tên là số nhóm', () => {
    expect(resolveDesignatedCaptain([named('a', 1), on('b', 2)], 'b')).toBe('b');
  });
});

describe('captainAfterEntry', () => {
  it('người vào có tên là số nhóm → thành đội trưởng, thay người vào đầu', () => {
    expect(captainAfterEntry([on('a', 1), on('b', 2), named('n', 3)], 'a', 'n')).toBe('n');
  });
  it('… thay cả đội trưởng do admin chọn (vd. nhóm trưởng thật vào muộn)', () => {
    expect(captainAfterEntry([on('a', 1), on('b', 2), named('n', 3)], 'b', 'n')).toBe('n');
  });
  it('người vào đầu tiên có tên là số nhóm → đội trưởng', () => {
    expect(captainAfterEntry([named('n', 1)], null, 'n')).toBe('n');
  });
  it('đội trưởng hiện tại cũng có tên là số nhóm → người đến trước giữ', () => {
    expect(captainAfterEntry([named('n', 1), on('b', 2), named('m', 3)], 'n', 'm')).toBe('n');
  });
  it('người vào không có tên là số nhóm → giữ đội trưởng hiện tại', () => {
    expect(captainAfterEntry([on('a', 1), named('n', 2), on('c', 3)], 'n', 'c')).toBe('n');
    expect(captainAfterEntry([on('a', 1), on('c', 3)], 'a', 'c')).toBe('a');
  });
  it('nhóm chưa có đội trưởng, người vào thường → người vào sớm nhất', () => {
    expect(captainAfterEntry([on('c', 3)], null, 'c')).toBe('c');
  });
});

describe('namedCaptainInfo', () => {
  const team = (id: number, names: [string, string][]): PublicTeam => ({
    id,
    players: names.map(([pid, name]) => ({ id: pid, name, online: true, isCaptain: false, isDesignatedCaptain: false })),
  });

  it('người tên là số nhóm theo từng nhóm: đúng nhóm, hai người, vào nhầm nhóm, chưa có', () => {
    const teams = [
      team(1, [['a', 'An'], ['n1', '1']]),
      team(2, [['x', '1'], ['n2', 'Nhóm 2'], ['m2', '2']]),
      team(3, [['c', 'Chi']]),
    ];
    expect(namedCaptainInfo({ teams })).toEqual([
      { teamId: 1, inTeam: ['n1'], elsewhere: [{ playerId: 'x', teamId: 2 }] },
      { teamId: 2, inTeam: ['n2', 'm2'], elsewhere: [] },
      { teamId: 3, inTeam: [], elsewhere: [] },
    ]);
  });

  it('tên là số của nhóm không có trong danh sách nhóm → bỏ qua', () => {
    expect(namedCaptainInfo({ teams: [team(1, [['a', '5']])] })).toEqual([{ teamId: 1, inTeam: [], elsewhere: [] }]);
  });
});

describe('effectiveCaptain', () => {
  const now = 100_000;

  it('đội trưởng online → giữ quyền', () => {
    expect(effectiveCaptain([on('a', 1), on('b', 2)], 'a', now)).toBe('a');
  });
  it('mất kết nối chưa quá 10 giây → vẫn giữ quyền', () => {
    const members = [off('a', 1, now - CAPTAIN_GRACE_MS), on('b', 2)];
    expect(effectiveCaptain(members, 'a', now)).toBe('a');
  });
  it('mất kết nối quá 10 giây → chuyển cho thành viên online vào sớm nhất', () => {
    const members = [off('a', 1, now - CAPTAIN_GRACE_MS - 1), on('c', 5), on('b', 3)];
    expect(effectiveCaptain(members, 'a', now)).toBe('b');
  });
  it('bỏ qua thành viên offline khi chọn người thay thế', () => {
    const members = [off('a', 1, 0), off('b', 2, 0), on('c', 3)];
    expect(effectiveCaptain(members, 'a', now)).toBe('c');
  });
  it('đội trưởng quay lại → quyền được trả lại', () => {
    const before = [off('a', 1, 0), on('b', 2)];
    expect(effectiveCaptain(before, 'a', now)).toBe('b');
    const after = [on('a', 1), on('b', 2)];
    expect(effectiveCaptain(after, 'a', now)).toBe('a');
  });
  it('cả nhóm offline → vẫn là đội trưởng được chỉ định', () => {
    expect(effectiveCaptain([off('a', 1, 0), off('b', 2, 0)], 'a', now)).toBe('a');
  });
  it('đội trưởng do admin chỉ định giữ quyền dù vào muộn', () => {
    expect(effectiveCaptain([on('a', 1), on('b', 2)], 'b', now)).toBe('b');
  });
  it('đội trưởng chỉ định không còn trong nhóm → người vào sớm nhất', () => {
    expect(effectiveCaptain([on('b', 2), on('c', 3)], 'zzz', now)).toBe('b');
  });
  it('… ưu tiên người có tên là số nhóm', () => {
    expect(effectiveCaptain([on('b', 2), named('c', 3)], 'zzz', now)).toBe('c');
  });
  it('nhóm rỗng → null', () => {
    expect(effectiveCaptain([], null, now)).toBeNull();
  });
});
