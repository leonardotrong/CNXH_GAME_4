import type { IconName } from './Icon';

/** Luật tóm tắt cho màn RULES (GAME_SPEC 1, 2.2, 3, 3.7) — đọc trong khoảng 60 giây. */
export const BOARD_RULES: { icon: IconName; title: string; text: string }[] = [
  { icon: 'vote', title: 'Biểu quyết', text: 'Mỗi người bấm trên điện thoại. Cả nhóm bầu xong là tự chốt; đội trưởng ★ CHỐT sớm được khi quá nửa đã bầu. Nhóm chọn phương án nhiều phiếu nhất.' },
  { icon: 'target', title: 'Chọn ô (15 giây)', text: 'Chọn MỘT ô kề lãnh thổ nhóm mình: ô trống, ô nhóm khác hoặc ô Hiến pháp ở giữa.' },
  { icon: 'question', title: 'Trả lời (20 giây)', text: 'Cả lớp cùng trả lời một câu. Đúng mới được chiếm ô; chủ ô trả lời đúng thì được phòng thủ.' },
  { icon: 'bolt', title: 'Nhanh thắng', text: 'Nhiều nhóm đúng cùng tranh một ô → nhóm CHỐT sớm nhất (server tính tới mili-giây) thắng.' },
  { icon: 'book', title: 'Ô Hiến pháp = 3 điểm', text: 'Chiếm được → Khiên Hiến pháp: lượt sau không ai tấn công được nhóm bạn.' },
  { icon: 'shield', title: 'Khiên bảo hộ', text: 'Mất từ 2 ô trở lên trong một lượt → được bảo vệ ở lượt sau.' },
  {
    icon: 'star',
    title: 'Ô Cơ quan & ★ Lòng dân = 2 điểm',
    text: '4 ô Quốc hội, Chính phủ, Tòa án, Viện kiểm sát quanh ô Hiến pháp. Lượt 3, 6, 9, 12: ★ Lòng dân rơi xuống một ô bất ngờ.',
  },
  { icon: 'bomb', title: 'Cuối trận: Quả Bom Tham Nhũng', text: 'Trả lời đúng để chuyền bom đi. Bom nổ trong tay → mất 2 ô!' },
];
