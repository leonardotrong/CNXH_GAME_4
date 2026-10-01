import type { Phase } from '@cnxh/shared';

export { describeCell, describeExplosion, describeShield, formatSeconds, shieldName } from '@cnxh/shared';

export const PHASE_LABELS: Partial<Record<Phase, string>> = {
  LOBBY: 'Phòng chờ',
  RULES: 'Luật chơi',
  BOARD_SELECT: 'Chọn ô mục tiêu',
  BOARD_QUESTION: 'Trả lời câu hỏi',
  BOARD_REVEAL: 'Kết quả lượt',
  BOMB_INTRO: 'Quả Bom Tham Nhũng',
  BOMB_QUESTION: 'Nhóm cầm bom trả lời',
  BOMB_REVEAL: 'Đáp án',
  BOMB_PASS: 'Chuyền bom',
  BOMB_EXPLODE: 'BÙM!',
  SUMMARY: 'Kết thúc trận',
};

export function isBombPhase(phase: Phase): boolean {
  return phase.startsWith('BOMB_');
}

