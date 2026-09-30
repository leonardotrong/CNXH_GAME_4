import { CELLS, CONSTITUTION_CELL, type CellId, type ShieldGrant, type TurnOutcome } from '@cnxh/shared';
import { TEAM_COLORS } from './teams';

/**
 * Bàn cờ lục giác vẽ bằng SVG (GAME_SPEC 3.1), dùng chung cho màn chiếu, bản đồ thu nhỏ trên điện thoại và admin.
 * Hướng đỉnh nhọn: tâm ô (q, r) = (√3·(q + r/2), 1.5·r) × SIZE.
 */
const SIZE = 10;
const SQRT3 = Math.sqrt(3);
const EMPTY_FILL = '#dedad2';
const GOLD = '#F4B400';

export interface HexBoardProps {
  owners: readonly (number | null)[];
  shields?: readonly ShieldGrant[];
  /** Ô chọn được (sáng lên, bấm được); undefined = không ở chế độ chọn. */
  selectable?: readonly CellId[];
  /** Số phiếu của nhóm mình trên từng ô (theo id ô). */
  counts?: readonly number[];
  /** Ô mình đang bỏ phiếu. */
  mine?: CellId | null;
  /** Ô nhóm đã chốt. */
  chosen?: CellId | null;
  /** Mục tiêu của các nhóm (sau khi SELECT đóng). */
  targets?: Readonly<Record<number, CellId | null>> | null;
  /** Kết quả lượt: tô nổi ô đổi chủ / phòng thủ. */
  outcome?: TurnOutcome | null;
  onCellClick?: (cellId: CellId) => void;
  className?: string;
  /** Nhãn cho trình đọc màn hình. */
  label?: string;
}

function center(q: number, r: number): [number, number] {
  return [SIZE * SQRT3 * (q + r / 2), SIZE * 1.5 * r];
}

function hexPoints(cx: number, cy: number, size: number): string {
  return Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 180) * (60 * i - 30);
    return `${(cx + size * Math.cos(a)).toFixed(2)},${(cy + size * Math.sin(a)).toFixed(2)}`;
  }).join(' ');
}

/** Vị trí huy hiệu mục tiêu thứ i trong n huy hiệu trên một ô. */
function badgeOffset(i: number, n: number): [number, number] {
  if (n === 1) return [0, -SIZE * 0.6];
  const angle = -Math.PI / 2 + ((i - (n - 1) / 2) * (2 * Math.PI)) / Math.max(n, 6);
  return [Math.cos(angle) * SIZE * 0.58, Math.sin(angle) * SIZE * 0.58];
}

/** Biểu tượng cuốn Hiến pháp (cuốn sách mở). */
function ConstitutionIcon({ cx, cy }: { cx: number; cy: number }) {
  return (
    <g transform={`translate(${cx} ${cy})`} className="hex-icon" aria-hidden>
      <path d="M-4.2,-2.6 L-0.3,-1.9 L-0.3,3 L-4.2,2.3 Z" fill="#fffbe6" stroke="#6b4e00" strokeWidth="0.45" />
      <path d="M4.2,-2.6 L0.3,-1.9 L0.3,3 L4.2,2.3 Z" fill="#fffbe6" stroke="#6b4e00" strokeWidth="0.45" />
      <path d="M-3.3,-1.2 L-1.1,-0.8 M-3.3,0.1 L-1.1,0.5 M1.1,-0.8 L3.3,-1.2 M1.1,0.5 L3.3,0.1" stroke="#6b4e00" strokeWidth="0.35" />
    </g>
  );
}

export function HexBoard({
  owners,
  shields = [],
  selectable,
  counts,
  mine = null,
  chosen = null,
  targets,
  outcome,
  onCellClick,
  className = '',
  label = 'Bàn cờ',
}: HexBoardProps) {
  const shielded = new Set(shields.map((s) => s.teamId));
  const selectableSet = selectable ? new Set(selectable) : null;
  const results = new Map((outcome?.cells ?? []).map((c) => [c.cellId, c.result]));

  const attackersByCell = new Map<CellId, number[]>();
  for (const [team, cell] of Object.entries(targets ?? {})) {
    if (cell === null || cell === undefined) continue;
    attackersByCell.set(cell, [...(attackersByCell.get(cell) ?? []), Number(team)].sort((a, b) => a - b));
  }

  const half = SIZE * SQRT3 * 3.5 + 2;
  const halfH = SIZE * 5.5 + 2;

  return (
    <svg
      className={`hex-board ${selectableSet ? 'hex-board--selecting' : ''} ${className}`}
      viewBox={`${-half} ${-halfH} ${half * 2} ${halfH * 2}`}
      role="img"
      aria-label={label}
    >
      {CELLS.map((cell) => {
        const [cx, cy] = center(cell.q, cell.r);
        const owner = owners[cell.id] ?? null;
        const isConstitution = cell.id === CONSTITUTION_CELL;
        const fill = owner !== null ? TEAM_COLORS[owner] : isConstitution ? GOLD : EMPTY_FILL;
        const canPick = selectableSet?.has(cell.id) ?? false;
        const classes = ['hex'];
        if (owner !== null && shielded.has(owner)) classes.push('hex--shielded');
        if (selectableSet) classes.push(canPick ? 'hex--selectable' : 'hex--disabled');
        if (cell.id === mine) classes.push('hex--mine');
        if (cell.id === chosen) classes.push('hex--chosen');
        const result = results.get(cell.id);
        if (result) classes.push(`hex--${result}`);
        const vote = counts?.[cell.id] ?? 0;
        const attackers = attackersByCell.get(cell.id) ?? [];
        return (
          <g
            key={cell.id}
            className={classes.join(' ')}
            onClick={canPick && onCellClick ? () => onCellClick(cell.id) : undefined}
            role={canPick && onCellClick ? 'button' : undefined}
            aria-label={canPick ? `Chọn ô ${cell.q},${cell.r}` : undefined}
          >
            <polygon className="hex__shape" points={hexPoints(cx, cy, SIZE * 0.95)} fill={fill} />
            {isConstitution && (
              <polygon className="hex__constitution" points={hexPoints(cx, cy, SIZE * 0.8)} fill="none" stroke={GOLD} strokeWidth="1.3" />
            )}
            {isConstitution && <ConstitutionIcon cx={cx} cy={owner !== null ? cy + 3.4 : cy} />}
            {owner !== null && (
              <text
                className="hex__owner"
                x={cx}
                // Chừa chỗ phía trên cho huy hiệu mục tiêu.
                y={isConstitution ? cy - 1.2 : attackers.length > 0 ? cy + 2 : cy}
                dominantBaseline="central"
                textAnchor="middle"
              >
                {owner}
              </text>
            )}
            {vote > 0 && (
              <g className="hex__votes">
                <circle cx={cx + SIZE * 0.5} cy={cy + SIZE * 0.45} r={3} />
                <text x={cx + SIZE * 0.5} y={cy + SIZE * 0.45} dominantBaseline="central" textAnchor="middle">
                  {vote}
                </text>
              </g>
            )}
            {attackers.map((team, i) => {
              const [dx, dy] = badgeOffset(i, attackers.length);
              return (
                <g key={team} className="hex__target">
                  <circle cx={cx + dx} cy={cy + dy} r={2.7} fill={TEAM_COLORS[team]} />
                  <text x={cx + dx} y={cy + dy} dominantBaseline="central" textAnchor="middle">
                    {team}
                  </text>
                </g>
              );
            })}
          </g>
        );
      })}
    </svg>
  );
}
