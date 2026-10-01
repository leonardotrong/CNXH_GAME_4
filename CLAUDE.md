# CLAUDE.md — Game lớp Chủ nghĩa xã hội khoa học

## Dự án
Web app trò chơi cho lớp Chủ nghĩa xã hội khoa học (~60 sinh viên, 7 nhóm cố định, ~30 phút trên lớp).
Hai trò chơi trên CÙNG một bàn cờ: "Bàn Cờ Quyền Lực" (chiếm ô) rồi "Quả Bom Tham Nhũng" (chuyền bom, nổ thì mất ô).
Máy chiếu chạy màn `/host`, sinh viên quét QR vào `/play` trên điện thoại (không cài app), người dẫn điều khiển ở `/admin`.
Chủ đề kiến thức: nhà nước, nhà nước XHCN, đặc điểm nhà nước pháp quyền XHCN Việt Nam.

## Tài liệu — đọc phần cần cho việc đang làm, không cần đọc hết mỗi lần
- `docs/GAME_SPEC.md` — luật chơi + yêu cầu kỹ thuật. Là NGUỒN SỰ THẬT về luật.
- `docs/ROADMAP.md` — các giai đoạn, tiêu chí hoàn thành.
- `docs/CONTENT.md` — kiến thức môn học, quy tắc soạn câu hỏi (chỉ đọc khi làm việc với câu hỏi).
- `data/questions.json` — ngân hàng câu hỏi.

## Stack
- Monorepo npm workspaces: `server/` (Node + TypeScript + Express + Socket.IO), `client/` (Vite + React + TypeScript), `shared/` (types + logic game dạng hàm thuần).
- Test: Vitest. Dev server chạy bằng `tsx`.
- Deploy: một service duy nhất trên Render/Railway; server phục vụ luôn bản build của client.

## Nguyên tắc bất di bất dịch
1. Server là trọng tài duy nhất: đồng hồ, đáp án đúng, giải quyết tranh chấp, ngòi bom.
2. KHÔNG BAO GIỜ gửi ngòi bom hay thời gian còn lại của bom xuống client, kể cả gián tiếp (vd. tốc độ hiệu ứng tỉ lệ với thời gian còn lại).
3. Không gửi đáp án đúng xuống client trước khi câu hỏi đóng.
4. "Nhanh hơn" = thời điểm SERVER nhận lệnh CHỐT của nhóm.
5. Logic game là hàm thuần trong `shared/` và có unit test; server chỉ điều phối I/O và timer.
6. Giao diện tiếng Việt có dấu. `/play` mobile-first, nút to. `/host` đọc được từ cuối lớp trên máy chiếu.
7. Chịu được mất kết nối: `playerId` lưu localStorage, vào lại giữ nguyên nhóm và vai trò.

## Quy ước làm việc
- Trả lời tôi bằng tiếng Việt. Tên biến, hàm, file bằng tiếng Anh.
- Muốn đổi luật: cập nhật `docs/GAME_SPEC.md` trước (kèm dòng trong mục Nhật ký quyết định), rồi mới sửa code.
- Mỗi giai đoạn: viết/cập nhật test → cài đặt → chạy test → báo tôi → commit.
- Hỏi trước khi thêm thư viện lớn hoặc đổi stack.

## Lệnh
- `npm install` — cài toàn bộ workspace (Node ≥ 20)
- `npm run dev` — chạy song song server (`tsx watch`, cổng 3000) và client (Vite, cổng 5173). Mở http://localhost:5173/host | /play | /admin; Vite proxy `/socket.io` và `/api` sang server. Điện thoại cùng mạng LAN vào qua địa chỉ "Network" mà Vite in ra.
- `npm test` — chạy toàn bộ test một lần (Vitest, file `shared/src/**/*.test.ts` và `server/src/**/*.test.ts`); `npm run test:watch` để chạy liên tục
- `npm run typecheck` — kiểm tra kiểu cả 3 workspace
- `npm run build` — typecheck + build client ra `client/dist`
- `npm start` — chạy server production (`NODE_ENV=production`, cổng `PORT`, mặc định 3000), phục vụ luôn `client/dist`
- `npm run simulate` — giả lập 63 bot chơi trọn một trận trên server trong tiến trình (thời lượng rút ngắn, ~2,5 phút); `-- --turns 3 --bombs 1` cho nhanh; `-- --url https://... --password ... --real` để thử tải bản deploy
- Deploy: xem `docs/DEPLOY.md` (Render Blueprint `render.yaml`)

Biến môi trường: `ADMIN_PASSWORD` (bắt buộc để vào `/admin`, vd. `ADMIN_PASSWORD=admin npm run dev`), `STATE_FILE` (file lưu trạng thái trận, mặc định `server/data/match.json`; đặt rỗng để tắt), `PUBLIC_URL` (địa chỉ công khai/LAN dùng để tạo QR trên `/host`; mặc định là origin của trang host — khi dev nên đặt thành địa chỉ "Network" của Vite để điện thoại quét được).

Ghi chú kỹ thuật: `shared/` xuất thẳng mã TypeScript (`@cnxh/shared` → `shared/src/index.ts`), không có bước build riêng; server luôn chạy qua `tsx` (cả production). Kiểu sự kiện Socket.IO nằm trong `shared/src/events.ts`.

Giao diện: CSS trong `client/src/styles/` (`base` token màu + nền "sân khấu" tối, `components`, `board`, `host`, `play`, `admin` nền sáng); màu nhóm truyền qua biến CSS `--team` (`teamStyle()` trong `client/src/teams.ts`). Phông Be Vietnam Pro tự host qua `@fontsource/be-vietnam-pro` (không cần mạng ngoài). Màn chiếu tính mọi kích thước theo `--u` (1% chiều rộng, giới hạn theo chiều cao 16:9) để vừa khít một màn hình ở mọi độ phân giải. Hoạt ảnh bom (tia lửa, lắc, nhấp nháy) luôn có nhịp cố định.

Cloud: hook `SessionStart` (`.claude/settings.json` → `scripts/claude-session-start.sh`) tự `npm ci` khi chạy trên Claude Code on the web; ở máy local thì bỏ qua. GitHub Actions (`.github/workflows/ci.yml`) chạy typecheck + test + build cho mỗi push/PR.

## Trạng thái (cập nhật khi xong mỗi giai đoạn)
- [x] 0 — Khung dự án
- [x] 1 — Phòng chơi
- [x] 2 — Câu hỏi & biểu quyết
- [x] 3 — Bàn Cờ Quyền Lực
- [x] 4 — Quả Bom Tham Nhũng (hết Bàn Cờ → BOMB_INTRO, admin bấm bắt đầu; ngòi chỉ nằm trong `Room` ở server)
- [x] 5 — Admin & chế độ dự phòng (một timer/phòng theo `Room.nextDeadline()`; lưu `server/data/match.json`, khôi phục ở trạng thái tạm dừng; nhật ký chỉ gửi admin)
- [x] 6 — Giao diện & âm thanh (âm thanh Web Audio chỉ trên host, `client/src/sound.ts`; tích tắc bom nhịp cố định 500 ms)
- [ ] 7 — Test tải & deploy (đã xong: `scripts/simulate.ts` 63 bot × 14 lượt × 3 bom không lỗi, `render.yaml`, `docs/DEPLOY.md`, simulate trong CI; CÒN: deploy thật lên Render và thử ≥ 10 điện thoại 4G)
