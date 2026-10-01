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

/** Làm tối một màu hex (hệ số 0–1) — mặt bên "nổi khối" của ô và nút. */
function shade(hex: string, factor: number): string {
  const n = parseInt(hex.slice(1), 16);
  const channel = (shift: number) => Math.round(((n >> shift) & 255) * factor);
  return `#${((1 << 24) | (channel(16) << 16) | (channel(8) << 8) | channel(0)).toString(16).slice(1)}`;
}

/** Màu tối của từng nhóm (mặt bên ô, viền dưới nút). */
export const TEAM_SHADES: Record<number, string> = Object.fromEntries(Object.entries(TEAM_COLORS).map(([id, c]) => [id, shade(c, 0.7)]));

/** Đặt biến CSS `--team`, `--team-dark` (màu nhóm) cho một phần tử. */
export function teamStyle(teamId: number, extra?: CSSProperties): CSSProperties {
  return { '--team': TEAM_COLORS[teamId], '--team-dark': TEAM_SHADES[teamId], ...extra } as CSSProperties;
}

export { teamName } from '@cnxh/shared';
