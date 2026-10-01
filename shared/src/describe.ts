/**
 * Câu mô tả kết quả bằng tiếng Việt — dùng chung cho màn chiếu, điện thoại và nhật ký sự kiện của admin.
 * Hàm thuần, không chứa dữ liệu bí mật (chỉ mô tả kết quả ĐÃ công bố).
 */
import { CELLS, CONSTITUTION_CELL, type CellId, type ShieldGrant } from './board';
import type { Explosion } from './bomb';
import type { TeamId } from './lobby';
import type { CellOutcome, IgnoredTarget } from './resolveTurn';

export const teamName = (id: TeamId) => `Nhóm ${id}`;

export function formatSeconds(ms: number): string {
  return `${(ms / 1000).toLocaleString('vi-VN', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} s`;
}

/** Nhãn ô cho admin: số ô + tọa độ, vd. "ô #18 (0,0)". */
export function cellLabel(id: CellId): string {
  const c = CELLS[id];
  return c ? `ô #${id} (${c.q},${c.r})` : `ô #${id}`;
}

export function describeExplosion(e: Explosion): string {
  if (e.cells.length === 0) return `Bom nổ ở ${teamName(e.teamId)} — nhóm không còn ô nào để mất`;
  const constitution = e.cells.includes(CONSTITUTION_CELL) ? ' (có ô Hiến pháp)' : '';
  return `Bom nổ ở ${teamName(e.teamId)}: mất ${e.cells.length} ô${constitution}`;
}

function cellName(o: CellOutcome): string {
  if (o.cellId === CONSTITUTION_CELL) return 'ô Hiến pháp';
  return o.previousOwner === null ? 'ô trống' : `ô của ${teamName(o.previousOwner)}`;
}

/** Người về nhì (ứng viên trả lời đúng kế tiếp), để nói "nhanh hơn ai bao nhiêu". */
function runnerUp(o: CellOutcome): TeamId | null {
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

const IGNORED_REASONS: Record<IgnoredTarget['reason'], string> = {
  NOT_ON_BOARD: 'ngoài bàn cờ',
  OWN_CELL: 'ô của mình',
  NOT_ADJACENT: 'không kề lãnh thổ',
};

export function describeIgnored(x: IgnoredTarget): string {
  return `${teamName(x.teamId)}: mục tiêu ${cellLabel(x.cellId)} không hợp lệ (${IGNORED_REASONS[x.reason]}) — bỏ qua`;
}

export function shieldName(reason: ShieldGrant['reason']): string {
  return reason === 'constitution' ? 'Khiên Hiến pháp' : 'Khiên bảo hộ';
}

export function describeShield(s: ShieldGrant): string {
  return `${teamName(s.teamId)} nhận ${shieldName(s.reason)} cho lượt sau`;
}
