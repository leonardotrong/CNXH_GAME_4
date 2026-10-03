# ROADMAP — Lộ trình làm với Claude Code

Cách dùng:
- Mỗi giai đoạn một phiên. Sang giai đoạn mới thì `/clear` (tiến độ đã nằm trong CLAUDE.md và git).
- Chọn model/effort ở đầu giai đoạn rồi giữ nguyên đến hết giai đoạn.
- Với giai đoạn lớn, để Claude Code lập kế hoạch ở plan mode, duyệt kế hoạch rồi mới cho code.
- Xong giai đoạn: chạy `npm test`, đánh dấu trong mục Trạng thái của CLAUDE.md, commit.

| Giai đoạn | Model | Effort |
|---|---|---|
| 0 Khung dự án | `sonnet` | medium |
| 1 Phòng chơi | `sonnet` | medium |
| 2 Câu hỏi & biểu quyết | `opusplan` | medium |
| 3 Bàn Cờ Quyền Lực | `opusplan` | high |
| 4 Quả Bom Tham Nhũng | `opusplan` | high |
| 5 Admin & dự phòng | `sonnet` | medium |
| 6 Giao diện & âm thanh | `sonnet` | medium |
| 7 Test tải & deploy | `sonnet` | high |

Nếu một lỗi logic khó (đồng bộ, timer, tranh chấp) sửa hai lần vẫn sai dù đã đủ ngữ cảnh: chuyển `/model opus` cho riêng lỗi đó.

---

## Giai đoạn 0 — Khung dự án
**Xong khi:** `npm run dev` chạy cả server lẫn client; `/host`, `/play`, `/admin` hiện trang có tiêu đề; client kết nối Socket.IO và hiện "Đã kết nối"; `npm test` chạy 1 test mẫu.

> Đọc CLAUDE.md và mục 6 của docs/GAME_SPEC.md. Dựng khung monorepo theo phần Stack: npm workspaces server/, client/, shared/, TypeScript, Vitest, script dev chạy song song server và client. Ba route /host, /play, /admin mới chỉ cần tiêu đề và trạng thái kết nối Socket.IO. Chưa làm logic game. Xong thì cập nhật mục Lệnh trong CLAUDE.md.

## Giai đoạn 1 — Phòng chơi (Spec 2.1, 5.1 LOBBY, 5.2 vào phòng, 5.3 tạo phòng)
**Xong khi:** admin tạo phòng → host hiện QR + mã phòng; vài tab ẩn danh vào, chọn nhóm, tên hiện trên host; tải lại trang vẫn giữ nhóm; đội trưởng là người vào đầu; admin đổi được đội trưởng; quy tắc đội trưởng mất kết nối hoạt động.

> Làm Giai đoạn 1 theo docs/ROADMAP.md và các mục 2.1, 5.1 (LOBBY), 5.2 (vào phòng), 5.3 (tạo phòng, đổi đội trưởng) trong docs/GAME_SPEC.md. Viết test cho logic chọn và chuyển đội trưởng.

## Giai đoạn 2 — Câu hỏi & biểu quyết (Spec 2.2–2.4)
**Xong khi:** admin bấm "Câu thử" → mọi điện thoại hiện câu hỏi, đếm ngược khớp nhau; phiếu trực tiếp của nhóm; CHỐT chỉ bật khi quá nửa; hết giờ tự chốt; host hiện đáp án, giải thích, thứ tự chốt (ms); phương án được trộn; test phủ đa số, hòa, đội trưởng chưa bỏ phiếu, không có phiếu, quá nửa.

> Làm Giai đoạn 2 theo mục 2.2–2.4 của docs/GAME_SPEC.md, đọc câu hỏi từ data/questions.json. Lập kế hoạch trước: máy trạng thái của một câu hỏi, cách đo lệch đồng hồ, và danh sách test cho hàm tính lựa chọn của nhóm. Viết test kiểm tra không payload nào chứa đáp án đúng khi câu còn mở.

## Giai đoạn 3 — Bàn Cờ Quyền Lực (Spec mục 3)
**Xong khi:** test phủ: ô kề, mục tiêu hợp lệ (có khiên, nhóm 0 ô), nhiều nhóm tranh một ô, phòng thủ thành công/thất bại, Khiên Hiến pháp đúng 1 lượt, Khiên bảo hộ khi mất ≥ 2 ô, tính điểm và tiêu chí phụ; chơi thử 3 lượt với vài tab.

> Làm Giai đoạn 3 theo mục 3 của docs/GAME_SPEC.md. Trước khi code, liệt kê mọi tình huống biên của mục 3.3–3.5 và viết test cho chúng; resolveTurn phải là hàm thuần trong shared/. ultrathink khi thiết kế resolveTurn. Bàn cờ vẽ bằng SVG, dùng chung component cho host và bản đồ thu nhỏ trên điện thoại.

## Giai đoạn 4 — Quả Bom Tham Nhũng (Spec mục 4)
**Xong khi:** test chứng minh ngòi không xuất hiện trong bất kỳ payload nào gửi client; ngòi chỉ trừ trong BOMB_QUESTION; không chuyền ngược; nổ mất 2 ô; nổ giữa câu hủy câu; chọn người cầm bom đầu mỗi quả đúng 4.4.

> Làm Giai đoạn 4 theo mục 4 của docs/GAME_SPEC.md, nối tiếp trên bàn cờ của Giai đoạn 3. Lập kế hoạch cho máy trạng thái của bom và cách giữ ngòi chỉ ở server trước khi code.

## Giai đoạn 5 — Admin & chế độ dự phòng (Spec 5.3, mục 6 phần lưu trạng thái)
**Xong khi:** tắt server giữa trận rồi bật lại → trận tiếp tục đúng pha; chơi hết 1 lượt Bàn Cờ bằng chế độ dự phòng, không cần điện thoại; nhật ký sự kiện hiển thị trên /admin; tạm dừng/tiếp tục toàn cục.

## Giai đoạn 6 — Giao diện & âm thanh (Spec 5.1, 5.2, âm thanh ở mục 6)
**Xong khi:** host đọc rõ trên máy chiếu 1080p từ cuối lớp; hiệu ứng chiếm ô, mất ô, nổ bom; màn RULES và SUMMARY (6 đặc điểm từ docs/CONTENT.md mục 3); âm thanh Web Audio API; nút tắt tiếng; điện thoại dùng tốt trên màn hình 360px.

## Giai đoạn 7 — Test tải & deploy
**Xong khi:** `npm run simulate` chạy 63 bot hết một trận không lỗi; deploy lên Render/Railway; thử thật với ít nhất 10 điện thoại dùng 4G.

> Viết scripts/simulate.ts theo mục 6 của docs/GAME_SPEC.md, chạy một trận đầy đủ, sửa lỗi phát sinh. Sau đó hướng dẫn tôi deploy lên Render: biến môi trường, lệnh build/start, cấu hình cho Socket.IO.

---

## Checklist tổng duyệt trước buổi học
- Mở link deploy (https://cnxh-game.onrender.com/host) trước giờ học khoảng 15 phút (gói miễn phí của Render có thể "ngủ" khi không có truy cập).
- Chơi thử một trận đầy đủ với vài bạn cùng lớp.
- In sẵn mã QR cỡ lớn, chuẩn bị 7 bộ thẻ màu A/B/C/D cho chế độ dự phòng.
- Kiểm tra máy chiếu (độ phân giải, tỉ lệ) và loa.
- Có sẵn slide 6 đặc điểm phòng khi màn tổng kết lỗi.
- Nhắc lớp bật 4G nếu wifi phòng học yếu.
