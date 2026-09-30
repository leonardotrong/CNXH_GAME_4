import { describe, expect, it } from 'vitest';
import { PHASES, isPhase } from './phases';

describe('PHASES', () => {
  it('bắt đầu ở LOBBY và kết thúc ở SUMMARY', () => {
    expect(PHASES[0]).toBe('LOBBY');
    expect(PHASES[PHASES.length - 1]).toBe('SUMMARY');
  });

  it('isPhase chỉ nhận tên pha hợp lệ', () => {
    expect(isPhase('BOARD_SELECT')).toBe(true);
    expect(isPhase('board_select')).toBe(false);
    expect(isPhase(42)).toBe(false);
  });
});
