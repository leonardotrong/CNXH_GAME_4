import { RULES_EXAMPLE } from '@cnxh/shared';
import { HexBoard } from './HexBoard';
import { Icon } from './Icon';
import { MAP_LEGEND, type LegendSwatch } from './rules';
import { teamStyle } from './teams';

/** Mẫu nhỏ của từng loại ô, cùng màu với bàn cờ. */
function Swatch({ kind }: { kind: LegendSwatch }) {
  switch (kind) {
    case 'constitution':
      return (
        <span className="rules-swatch is-constitution" aria-hidden>
          <Icon name="book" />
        </span>
      );
    case 'organ':
      return (
        <span className="rules-swatch is-organ" aria-hidden>
          QH
        </span>
      );
    case 'star':
      return (
        <span className="rules-swatch is-star" aria-hidden>
          <Icon name="star" />
        </span>
      );
    case 'team':
      return (
        <span className="rules-swatch is-team" style={teamStyle(1)} aria-hidden>
          1
        </span>
      );
    case 'target':
      return (
        <span className="rules-swatch is-target" style={teamStyle(7)} aria-hidden>
          7
        </span>
      );
  }
}

/**
 * Bản đồ minh họa ở màn luật (GAME_SPEC 5.1 RULES): bàn cờ ví dụ "giữa trận" (`RULES_EXAMPLE`, đúng luật — có test)
 * vẽ bằng đúng component bàn cờ của trận, kèm chú giải giá trị ô. `dropStar` = ★ rơi xuống một lần khi hiện (màn chiếu);
 * điện thoại để tĩnh.
 */
export function RulesMap({ dropStar = false, className = '' }: { dropStar?: boolean; className?: string }) {
  const { board, targets } = RULES_EXAMPLE;
  return (
    <figure className={`rules-map ${className}`}>
      <figcaption className="rules-map__caption">Ví dụ: bàn cờ giữa trận</figcaption>
      <div className="rules-map__board">
        <HexBoard
          owners={board.owners}
          stars={board.stars}
          newStar={dropStar ? (board.stars[0] ?? null) : null}
          targets={targets}
          label="Bản đồ minh họa: mỗi nhóm lan từ ô xuất phát ở viền vào giữa; Nhóm 1 và Nhóm 7 cùng nhắm ô Hiến pháp"
        />
      </div>
      <ul className="rules-map__legend">
        {MAP_LEGEND.map((item) => (
          <li key={item.swatch}>
            <Swatch kind={item.swatch} />
            <span>
              <b>
                {item.label}
                {item.points && <> · {item.points}</>}
              </b>{' '}
              <span className="rules-map__note">{item.note}</span>
            </span>
          </li>
        ))}
      </ul>
    </figure>
  );
}
