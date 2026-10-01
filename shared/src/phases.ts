/**
 * Các pha của máy trạng thái trận đấu (GAME_SPEC mục 6):
 * LOBBY → RULES → (BOARD_SELECT → BOARD_QUESTION → BOARD_REVEAL) × N
 *   → BOMB_INTRO → (BOMB_QUESTION ↔ BOMB_REVEAL → BOMB_PASS … → BOMB_EXPLODE) × số bom → SUMMARY
 */
export const PHASES = [
  'LOBBY',
  'RULES',
  'BOARD_SELECT',
  'BOARD_QUESTION',
  'BOARD_REVEAL',
  'BOMB_INTRO',
  'BOMB_QUESTION',
  'BOMB_REVEAL',
  'BOMB_PASS',
  'BOMB_EXPLODE',
  'SUMMARY',
] as const;

export type Phase = (typeof PHASES)[number];

export function isPhase(value: unknown): value is Phase {
  return typeof value === 'string' && (PHASES as readonly string[]).includes(value);
}
