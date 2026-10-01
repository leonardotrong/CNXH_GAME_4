import type { ReactNode } from 'react';
import { teamName, teamStyle } from './teams';

/** Nhãn nhóm: viên thuốc màu nhóm, chữ trắng. */
export function TeamTag({ teamId, children, className = '' }: { teamId: number; children?: ReactNode; className?: string }) {
  return (
    <span className={`team-tag ${className}`} style={teamStyle(teamId)}>
      {children ?? teamName(teamId)}
    </span>
  );
}
