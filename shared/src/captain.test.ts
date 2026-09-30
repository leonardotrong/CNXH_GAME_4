import { describe, expect, it } from 'vitest';
import {
  CAPTAIN_GRACE_MS,
  effectiveCaptain,
  pickDesignatedCaptain,
  resolveDesignatedCaptain,
  type CaptainCandidate,
} from './captain';

const on = (id: string, teamJoinSeq: number): CaptainCandidate => ({
  id, teamJoinSeq, online: true, offlineSince: null,
});
const off = (id: string, teamJoinSeq: number, offlineSince: number): CaptainCandidate => ({
  id, teamJoinSeq, online: false, offlineSince,
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
  it('nhóm rỗng → null', () => {
    expect(effectiveCaptain([], null, now)).toBeNull();
  });
});
