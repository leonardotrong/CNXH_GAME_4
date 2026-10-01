/** Màn tổng kết (GAME_SPEC 5.1 SUMMARY) — lấy từ docs/CONTENT.md mục 3 và 6. */
export const SIX_FEATURES: { title: string; text: string }[] = [
  { title: 'Nhân dân làm chủ', text: 'Nhà nước do nhân dân lao động làm chủ — Nhà nước của dân, do dân, vì dân.' },
  { title: 'Hiến pháp và pháp luật', text: 'Tổ chức và hoạt động trên cơ sở Hiến pháp và pháp luật; pháp luật giữ vị trí tối thượng.' },
  {
    title: 'Quyền lực thống nhất',
    text: 'Quyền lực nhà nước là thống nhất, có sự phân công rõ ràng, phối hợp nhịp nhàng và kiểm soát giữa các cơ quan lập pháp, hành pháp, tư pháp.',
  },
  { title: 'Đảng lãnh đạo', text: 'Do Đảng Cộng sản Việt Nam lãnh đạo (Điều 4 Hiến pháp 2013); hoạt động của Nhà nước được nhân dân giám sát.' },
  {
    title: 'Con người là trung tâm',
    text: 'Tôn trọng quyền con người, coi con người là chủ thể, là trung tâm của sự phát triển; quyền dân chủ của nhân dân được thực hành rộng rãi.',
  },
  {
    title: 'Tập trung dân chủ',
    text: 'Bộ máy nhà nước theo nguyên tắc tập trung dân chủ, có phân công, phân cấp, phối hợp và kiểm soát lẫn nhau, bảo đảm quyền lực thống nhất và sự chỉ đạo thống nhất của Trung ương.',
  },
];

/** Ánh xạ luật chơi ↔ bài học (CONTENT.md mục 6). */
export const GAME_LESSONS: { game: string; lesson: string }[] = [
  { game: 'Biểu quyết đa số, CHỐT cần quá nửa, hòa thì đội trưởng quyết', lesson: 'nguyên tắc tập trung dân chủ' },
  { game: 'Ô Hiến pháp trao khiên', lesson: 'pháp luật giữ vị trí tối thượng' },
  { game: 'Quả Bom Tham Nhũng', lesson: 'quyền lực cần được kiểm soát, phòng chống tham nhũng' },
  { game: 'Câu hỏi về Quốc hội, Chính phủ, Tòa án, Viện kiểm sát', lesson: 'quyền lực thống nhất, có phân công, phối hợp, kiểm soát' },
];
