import type { ReactNode } from 'react';
import { teamName, teamStyle } from './teams';

/** Tên nhóm kèm chấm màu nhóm (chữ giữ màu nền chữ để luôn dễ đọc). */
export function TeamTag({ teamId, children, className = '' }: { teamId: number; children?: ReactNode; className?: string }) {
  return (
    <span className={`team-tag ${className}`} style={teamStyle(teamId)}>
      <i aria-hidden />
      {children ?? teamName(teamId)}
    </span>
  );
}

/** Ô vuông màu nhóm có số nhóm (dùng trong bảng điểm, thứ tự chốt). */
export function Swatch({ teamId, hollow = false }: { teamId: number; hollow?: boolean }) {
  return (
    <span className={`swatch ${hollow ? 'is-hollow' : ''}`} style={teamStyle(teamId)}>
      {teamId}
    </span>
  );
}
