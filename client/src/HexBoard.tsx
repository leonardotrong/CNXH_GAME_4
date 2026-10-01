import { memo, useId } from 'react';
import { CELLS, CONSTITUTION_CELL, type CellId, type ShieldGrant, type TurnOutcome } from '@cnxh/shared';
import { TEAM_COLORS } from './teams';

/**
 * Bàn cờ lục giác vẽ bằng SVG (GAME_SPEC 3.1), dùng chung cho màn chiếu, bản đồ thu nhỏ trên điện thoại và admin.
 * Hướng đỉnh nhọn: tâm ô (q, r) = (√3·(q + r/2), 1.5·r) × SIZE.
 * Màu ô trống lấy từ biến CSS `--hex-empty` để hợp với nền tối (host, điện thoại) lẫn nền sáng (admin).
 */
const SIZE = 10;
const SQRT3 = Math.sqrt(3);

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
  /** Ô vừa bị bom nổ (đã thành ô trống). */
  blasted?: readonly CellId[];
  /** Nhóm đang cầm bom: ô của nhóm nhấp nháy đỏ. */
  bombTeam?: number | null;
  onCellClick?: (cellId: CellId) => void;
  /** Ô đang được admin chọn để chỉnh tay. */
  focused?: CellId | null;
  /** Hiện số ô (admin). */
  showIds?: boolean;
  className?: string;
  /** Nhãn cho trình đọc màn hình. */
  label?: string;
}

function vertex(cx: number, cy: number, size: number, i: number): [number, number] {
  const a = (Math.PI / 180) * (60 * i - 30);
  return [cx + size * Math.cos(a), cy + size * Math.sin(a)];
}

/** Lục giác bo góc dạng path (cạnh lục giác đều = bán kính ngoại tiếp `size`). */
function hexPath(cx: number, cy: number, size: number, round: number): string {
  const v = Array.from({ length: 6 }, (_, i) => vertex(cx, cy, size, i));
  const k = round / size;
  const at = (a: [number, number], b: [number, number]) => `${(a[0] + (b[0] - a[0]) * k).toFixed(2)},${(a[1] + (b[1] - a[1]) * k).toFixed(2)}`;
  const parts = v.map((cur, i) => {
    const prev = v[(i + 5) % 6]!;
    const next = v[(i + 1) % 6]!;
    return `${i === 0 ? 'M' : 'L'}${at(cur, prev)} Q${cur[0].toFixed(2)},${cur[1].toFixed(2)} ${at(cur, next)}`;
  });
  return `${parts.join(' ')} Z`;
}

/** Hình học tính sẵn một lần cho 37 ô. */
const GEOMETRY = CELLS.map((cell) => {
  const cx = SIZE * SQRT3 * (cell.q + cell.r / 2);
  const cy = SIZE * 1.5 * cell.r;
  return { cell, cx, cy, shape: hexPath(cx, cy, SIZE * 0.94, 1.8), inner: hexPath(cx, cy, SIZE * 0.74, 1.4) };
});

/** Vị trí huy hiệu mục tiêu thứ i trong n huy hiệu trên một ô. */
function badgeOffset(i: number, n: number): [number, number] {
  if (n === 1) return [0, -SIZE * 0.56];
  const angle = -Math.PI / 2 + ((i - (n - 1) / 2) * (2 * Math.PI)) / Math.max(n, 6);
  return [Math.cos(angle) * SIZE * 0.56, Math.sin(angle) * SIZE * 0.56];
}

/** Biểu tượng cuốn Hiến pháp (cuốn sách mở). */
function ConstitutionIcon({ cx, cy }: { cx: number; cy: number }) {
  return (
    <g transform={`translate(${cx} ${cy})`} className="hex-icon" aria-hidden>
      <path d="M-4.2,-2.6 L-0.3,-1.9 L-0.3,3 L-4.2,2.3 Z" fill="#fffbe6" stroke="#6b4e00" strokeWidth="0.45" strokeLinejoin="round" />
      <path d="M4.2,-2.6 L0.3,-1.9 L0.3,3 L4.2,2.3 Z" fill="#fffbe6" stroke="#6b4e00" strokeWidth="0.45" strokeLinejoin="round" />
      <path d="M-3.3,-1.2 L-1.1,-0.8 M-3.3,0.1 L-1.1,0.5 M1.1,-0.8 L3.3,-1.2 M1.1,0.5 L3.3,0.1" stroke="#6b4e00" strokeWidth="0.35" />
    </g>
  );
}

export const HexBoard = memo(function HexBoard({
  owners,
  shields = [],
  selectable,
  counts,
  mine = null,
  chosen = null,
  targets,
  outcome,
  blasted,
  bombTeam = null,
  onCellClick,
  focused = null,
  showIds = false,
  className = '',
  label = 'Bàn cờ',
}: HexBoardProps) {
  const id = `hb${useId().replace(/[^\w-]/g, '')}`;
  const shielded = new Set(shields.map((s) => s.teamId));
  const selectableSet = selectable ? new Set(selectable) : null;
  const results = new Map((outcome?.cells ?? []).map((c) => [c.cellId, c.result]));
  const blastedSet = new Set(blasted ?? []);

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
      <defs>
        <linearGradient id={`${id}-shine`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.3" />
          <stop offset="0.45" stopColor="#fff" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.2" />
        </linearGradient>
        <linearGradient id={`${id}-gold`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffd75e" />
          <stop offset="1" stopColor="#e9a400" />
        </linearGradient>
      </defs>
      {GEOMETRY.map(({ cell, cx, cy, shape, inner }) => {
        const owner = owners[cell.id] ?? null;
        const isConstitution = cell.id === CONSTITUTION_CELL;
        const canPick = selectableSet?.has(cell.id) ?? false;
        const classes = ['hex', owner !== null ? 'hex--owned' : isConstitution ? 'hex--gold' : 'hex--empty'];
        if (isConstitution) classes.push('hex--constitution');
        if (owner !== null && shielded.has(owner)) classes.push('hex--shielded');
        if (selectableSet) classes.push(canPick ? 'hex--selectable' : 'hex--disabled');
        if (cell.id === mine) classes.push('hex--mine');
        if (cell.id === chosen) classes.push('hex--chosen');
        if (cell.id === focused) classes.push('hex--focused');
        const result = results.get(cell.id);
        if (result) classes.push(`hex--${result}`);
        if (owner !== null && owner === bombTeam) classes.push('hex--bomb');
        const isBlasted = blastedSet.has(cell.id);
        if (isBlasted) classes.push('hex--blasted');
        const vote = counts?.[cell.id] ?? 0;
        const attackers = attackersByCell.get(cell.id) ?? [];
        const fill = owner !== null ? TEAM_COLORS[owner] : isConstitution ? `url(#${id}-gold)` : undefined;
        return (
          <g
            key={cell.id}
            className={classes.join(' ')}
            onClick={canPick && onCellClick ? () => onCellClick(cell.id) : undefined}
            role={canPick && onCellClick ? 'button' : undefined}
            aria-label={canPick ? `Chọn ô ${cell.q},${cell.r}` : undefined}
          >
            <path className="hex__shape" d={shape} style={fill ? { fill } : undefined} />
            <path className="hex__shine" d={shape} fill={`url(#${id}-shine)`} />
            {isConstitution && <path className="hex__ring" d={inner} />}
            {isConstitution && <ConstitutionIcon cx={cx} cy={owner !== null ? cy + 3.4 : cy} />}
            {owner !== null && (
              <text
                className="hex__owner"
                x={cx}
                // Chừa chỗ phía trên cho huy hiệu mục tiêu.
                y={isConstitution ? cy - 1.4 : attackers.length > 0 ? cy + 2 : cy}
                dominantBaseline="central"
                textAnchor="middle"
              >
                {owner}
              </text>
            )}
            {vote > 0 && (
              <g className="hex__votes">
                <circle cx={cx + SIZE * 0.48} cy={cy + SIZE * 0.42} r={3.1} />
                <text x={cx + SIZE * 0.48} y={cy + SIZE * 0.42} dominantBaseline="central" textAnchor="middle">
                  {vote}
                </text>
              </g>
            )}
            {showIds && (
              <text className="hex__id" x={cx} y={cy + SIZE * 0.6} dominantBaseline="central" textAnchor="middle">
                {cell.id}
              </text>
            )}
            {isBlasted && (
              <text className="hex__blast" x={cx} y={cy} dominantBaseline="central" textAnchor="middle">
                💥
              </text>
            )}
            {attackers.map((team, i) => {
              const [dx, dy] = badgeOffset(i, attackers.length);
              return (
                <g key={team} className="hex__target">
                  <circle cx={cx + dx} cy={cy + dy} r={2.8} fill={TEAM_COLORS[team]} />
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
});
