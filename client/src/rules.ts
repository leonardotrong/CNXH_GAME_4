import type { IconName } from './Icon';

/**
 * Luật tóm tắt cho màn RULES (GAME_SPEC 1, 2.2, 3) — đọc trong khoảng 60 giây.
 * Giá trị từng loại ô nằm ở chú giải bản đồ minh họa (`MAP_LEGEND`).
 */
export const BOARD_RULES: { icon: IconName; title: string; text: string }[] = [
  { icon: 'vote', title: 'Biểu quyết', text: 'Mỗi người bấm trên điện thoại, nhóm theo đa số. Cả nhóm bầu xong là tự chốt; đội trưởng ★ CHỐT sớm được khi quá nửa đã bầu.' },
  { icon: 'target', title: 'Chọn ô (15 giây)', text: 'Chọn MỘT ô kề lãnh thổ nhóm mình: ô trống, ô nhóm khác hoặc ô Hiến pháp ở giữa.' },
  { icon: 'question', title: 'Trả lời (20 giây)', text: 'Cả lớp cùng trả lời một câu. Đúng mới chiếm được ô; chủ ô trả lời đúng thì giữ được ô.' },
  { icon: 'bolt', title: 'Nhanh thắng', text: 'Nhiều nhóm đúng cùng tranh một ô → nhóm CHỐT sớm nhất thắng (server tính tới mili-giây).' },
  { icon: 'shield', title: 'Khiên', text: 'Chiếm ô Hiến pháp, hoặc mất từ 2 ô trở lên trong một lượt → lượt sau không ai tấn công được nhóm bạn.' },
  { icon: 'bomb', title: 'Quả Bom Tham Nhũng', text: 'Cuối trận: trả lời đúng để chuyền bom đi. Bom nổ trong tay → mất 2\u00a0ô!' },
];

export type LegendSwatch = 'constitution' | 'organ' | 'star' | 'team' | 'target';

/** Chú giải bản đồ minh họa ở màn luật (GAME_SPEC 3.6, 3.7, 5.1 RULES). */
export const MAP_LEGEND: { swatch: LegendSwatch; label: string; points?: string; note: string }[] = [
  { swatch: 'constitution', label: 'Hiến pháp', points: '3 điểm', note: 'chiếm được thì có Khiên' },
  { swatch: 'organ', label: 'Cơ quan', points: '2 điểm', note: 'Quốc hội, Chính phủ, Tòa án, Viện kiểm sát' },
  { swatch: 'star', label: 'Lòng dân', points: '2 điểm', note: 'rơi xuống ở lượt 3,\u00a06,\u00a09,\u00a012' },
  { swatch: 'team', label: 'Ô thường', points: '1 điểm', note: 'số trên ô = nhóm đang\u00a0giữ' },
  { swatch: 'target', label: 'Chấm tròn', note: 'nhóm đang nhắm ô đó' },
];
