/**
 * Câu mô tả kết quả bằng tiếng Việt — dùng chung cho màn chiếu, điện thoại và nhật ký sự kiện của admin.
 * Hàm thuần, không chứa dữ liệu bí mật (chỉ mô tả kết quả ĐÃ công bố).
 */
import { CELLS, CONSTITUTION_CELL, organAt, type CellId, type ShieldGrant } from './board';
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
  // Ô đặc biệt bị mất (Hiến pháp trước, rồi ô Cơ quan theo thứ tự ô) — mất nhiều điểm hơn ô thường.
  const special = [
    ...(e.cells.includes(CONSTITUTION_CELL) ? ['ô Hiến pháp'] : []),
    ...e.cells.flatMap((id) => {
      const organ = organAt(id);
      return organ ? [`ô ${organ.name}`] : [];
    }),
  ];
  return `Bom nổ ở ${teamName(e.teamId)}: mất ${e.cells.length} ô${special.length ? ` (có ${special.join(', ')})` : ''}`;
}

/**
 * Tên ô trong câu kết quả (GAME_SPEC 3.7): "ô Hiến pháp"; "ô Quốc hội", "ô Quốc hội của Nhóm 2";
 * "ô ★", "ô ★ của Nhóm 2"; "ô trống", "ô của Nhóm 2".
 */
export function cellName(cellId: CellId, owner: TeamId | null, star: boolean): string {
  if (cellId === CONSTITUTION_CELL) return 'ô Hiến pháp';
  const organ = organAt(cellId);
  const base = organ ? `ô ${organ.name}` : star ? 'ô ★' : 'ô';
  if (owner !== null) return `${base} của ${teamName(owner)}`;
  return base === 'ô' ? 'ô trống' : base;
}

const outcomeCellName = (o: CellOutcome) => cellName(o.cellId, o.previousOwner, o.star);

/** Nhật ký admin khi ★ Lòng dân xuất hiện; ★ rơi vào ô có chủ thì chủ ô được thêm 1 điểm ngay. */
export function describeStar(cellId: CellId, owner: TeamId | null): string {
  const where = `★ Lòng dân xuất hiện ở ${cellLabel(cellId)}`;
  return owner === null ? where : `${where} — ô của ${teamName(owner)}, ${teamName(owner)} được thêm 1 điểm`;
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
      return `${teamName(o.winner!)} chiếm ${outcomeCellName(o)}${margin}`;
    }
    case 'defended':
      return `${teamName(o.winner!)} phòng thủ thành công trước ${attackers}${o.marginMs !== null ? ` — nhanh hơn ${formatSeconds(o.marginMs)}` : ''}`;
    case 'tie':
      return `${o.contenders.filter((c) => c.correct).slice(0, 2).map((c) => teamName(c.teamId)).join(' và ')} chốt cùng mili-giây — ${outcomeCellName(o)} giữ nguyên`;
    case 'shielded':
      return `Khiên chặn ${attackers} tấn công ${outcomeCellName(o)}`;
    case 'failed':
      return `${attackers} tấn công ${outcomeCellName(o)} thất bại (trả lời sai)`;
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
