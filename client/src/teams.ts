import type { CSSProperties } from 'react';

/** Màu nhóm theo GAME_SPEC 3.1. */
export const TEAM_COLORS: Record<number, string> = {
  1: '#E53935',
  2: '#FB8C00',
  3: '#43A047',
  4: '#00ACC1',
  5: '#1E88E5',
  6: '#8E24AA',
  7: '#6D4C41',
};

/** Đặt biến CSS `--team` (màu nhóm) cho một phần tử; CSS dùng nó cho nền, viền, phát sáng. */
export function teamStyle(teamId: number, extra?: CSSProperties): CSSProperties {
  return { '--team': TEAM_COLORS[teamId], ...extra } as CSSProperties;
}

export { teamName } from '@cnxh/shared';
