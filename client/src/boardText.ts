import { CONSTITUTION_CELL, type CellOutcome, type Phase, type ShieldGrant } from '@cnxh/shared';
import { teamName } from './teams';

export const PHASE_LABELS: Partial<Record<Phase, string>> = {
  BOARD_SELECT: 'Chọn ô mục tiêu',
  BOARD_QUESTION: 'Trả lời câu hỏi',
  BOARD_REVEAL: 'Kết quả lượt',
  SUMMARY: 'Kết thúc Bàn Cờ',
};

export function formatSeconds(ms: number): string {
  return `${(ms / 1000).toLocaleString('vi-VN', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} s`;
}

function cellName(o: CellOutcome): string {
  if (o.cellId === CONSTITUTION_CELL) return 'ô Hiến pháp';
  return o.previousOwner === null ? 'ô trống' : `ô của ${teamName(o.previousOwner)}`;
}

/** Người về nhì (ứng viên trả lời đúng kế tiếp), để nói "nhanh hơn ai bao nhiêu". */
function runnerUp(o: CellOutcome): number | null {
  const second = o.contenders[1];
  return second?.correct ? second.teamId : null;
}

/** Một dòng mô tả kết quả của một ô bị nhắm. */
export function describeCell(o: CellOutcome): string {
  const attackers = o.attackers.map(teamName).join(', ');
  switch (o.result) {
    case 'captured': {
      const other = runnerUp(o);
      const margin = other !== null && o.marginMs !== null ? ` — nhanh hơn ${teamName(other)} ${formatSeconds(o.marginMs)}` : '';
      return `${teamName(o.winner!)} chiếm ${cellName(o)}${margin}`;
    }
    case 'defended':
      return `${teamName(o.winner!)} phòng thủ thành công trước ${attackers}${o.marginMs !== null ? ` — nhanh hơn ${formatSeconds(o.marginMs)}` : ''}`;
    case 'tie':
      return `${o.contenders.filter((c) => c.correct).slice(0, 2).map((c) => teamName(c.teamId)).join(' và ')} chốt cùng mili-giây — ${cellName(o)} giữ nguyên`;
    case 'shielded':
      return `Khiên chặn ${attackers} tấn công ${cellName(o)}`;
    case 'failed':
      return `${attackers} tấn công ${cellName(o)} thất bại (trả lời sai)`;
  }
}

export function shieldName(reason: ShieldGrant['reason']): string {
  return reason === 'constitution' ? 'Khiên Hiến pháp' : 'Khiên bảo hộ';
}

export function describeShield(s: ShieldGrant): string {
  return `${teamName(s.teamId)} nhận ${shieldName(s.reason)} cho lượt sau`;
}
