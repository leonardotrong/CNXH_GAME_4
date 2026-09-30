# GAME_SPEC — Bàn Cờ Quyền Lực & Quả Bom Tham Nhũng

## 0. Bối cảnh
- Lớp học phần Chủ nghĩa xã hội khoa học. Chủ đề: nhà nước, nhà nước XHCN, đặc điểm nhà nước pháp quyền XHCN Việt Nam.
- 7 nhóm cố định (Nhóm 1–7, trùng với nhóm của lớp), mỗi nhóm 7–9 người → 49–63 điện thoại.
- Thời lượng khoảng 30 phút. Tiêu chí: dễ hiểu, dễ chơi, vui, khuấy động, sáng tạo, cạnh tranh trực tiếp giữa các nhóm.
- Thiết bị: 1 máy chiếu (`/host`), 1 laptop của người dẫn (`/admin`), điện thoại sinh viên (`/play`, trình duyệt, không cài app).

## 1. Kịch bản 30 phút
| Phút | Pha | Nội dung |
|---|---|---|
| 0–3 | LOBBY | Quét QR, nhập tên, chọn nhóm |
| 3–4 | RULES | Host hiện luật tóm tắt (đọc trong 60 giây) |
| 4–21 | BOARD | Bàn Cờ Quyền Lực, 14 lượt (cấu hình được) |
| 21–28 | BOMB | Quả Bom Tham Nhũng, 3 quả, chơi trên chính bàn cờ |
| 28–30 | SUMMARY | Xếp hạng, vinh danh, tổng kết 6 đặc điểm |

## 2. Cơ chế chung

### 2.1 Người chơi, nhóm, đội trưởng
- Vào `/play?room=XXXX` (mã phòng 4 chữ số), nhập tên, chọn Nhóm 1–7.
- `playerId` lưu trong localStorage. Mất kết nối hoặc khóa màn hình rồi vào lại: giữ nguyên nhóm và vai trò.
- Đội trưởng = người vào nhóm đầu tiên; admin đổi được. Đội trưởng mất kết nối quá 10 giây thì quyền tạm chuyển cho thành viên đang online vào sớm nhất, và trả lại khi đội trưởng quay lại.
- Sau khi LOBBY đóng, người chơi không tự đổi nhóm (admin vẫn chuyển được).

### 2.2 Biểu quyết trong nhóm (dùng cho câu hỏi, chọn ô, chọn nhóm nhận bom)
- Mỗi thành viên online bấm lựa chọn trên điện thoại riêng; được đổi ý trong thời gian cho phép.
- Mọi thành viên thấy số phiếu trực tiếp của nhóm mình (không thấy nhóm khác).
- Đội trưởng có nút **CHỐT**. Nút chỉ bật khi quá nửa số thành viên đang online đã bỏ phiếu.
- Khi chốt: lựa chọn của nhóm = phương án nhiều phiếu nhất. Hòa → theo phiếu của đội trưởng; nếu đội trưởng chưa bỏ phiếu → phương án đạt số phiếu đó sớm nhất.
- Hết giờ mà chưa chốt: server tự chốt theo quy tắc trên (không cần quá nửa), thời điểm chốt = thời điểm hết giờ. Không có phiếu nào → nhóm không có lựa chọn (câu hỏi tính là sai, chọn ô tính là bỏ lượt).
- Thời điểm chốt do SERVER ghi nhận (mili-giây) là căn cứ duy nhất để so nhóm nào nhanh hơn.
- Nhóm đã chốt thì thành viên không đổi phiếu nữa. Khi mọi nhóm có người đều đã chốt, câu hỏi đóng ngay (không chờ hết giờ).
- Ý nghĩa bài học: thiểu số phục tùng đa số, bàn bạc dân chủ rồi quyết định tập trung → nguyên tắc tập trung dân chủ.

### 2.3 Câu hỏi
- Lấy từ `data/questions.json`, hai kho:
  - `board`: trắc nghiệm 4 phương án, 20 giây.
  - `bomb`: đúng/sai hoặc 2–3 phương án, 12 giây.
- Server trộn thứ tự phương án của câu trắc nghiệm mỗi lần hỏi (câu đúng/sai giữ nguyên "Đúng", "Sai").
- Không lặp câu trong một trận. Hết kho thì dùng lại câu đã hỏi, ưu tiên câu nhóm đang trả lời chưa gặp.
- Sau mỗi câu: host hiện đáp án đúng + giải thích (trường `explanation`) khoảng 8 giây. Đây là lúc học, không được bỏ.
- Câu hỏi hiện đầy đủ trên cả host và điện thoại (sinh viên ngồi cuối lớp đọc trên máy mình).

### 2.4 Công bằng và chống gian lận
- Đáp án đúng, đồng hồ, ngòi bom chỉ tồn tại trên server. Client chỉ nhận đáp án đúng SAU khi câu hỏi đóng.
- Client hiển thị đếm ngược từ `phaseEndsAt` (giờ server) có bù lệch đồng hồ đo khi kết nối. Không áp dụng cho ngòi bom.
- Người vào giữa câu vẫn được bỏ phiếu bình thường.

## 3. Bàn Cờ Quyền Lực

### 3.1 Bàn cờ
- Lưới lục giác, tọa độ axial `(q, r)`, bán kính 3 → **37 ô**. Hướng đỉnh nhọn (pointy-top).
- Ô trung tâm `(0,0)` = **ô Hiến pháp** (màu vàng kim, biểu tượng cuốn Hiến pháp).
- Vòng ngoài cùng (khoảng cách 3) có 18 ô, đánh số 0–17 theo một chiều cố định, bắt đầu từ góc `(0,-3)`: theo chiều kim đồng hồ trên màn hình (`(0,-3) → (3,-3) → (3,0) → (0,3) → (-3,3) → (-3,0) → (0,-3)`).
- Ô xuất phát (mỗi nhóm sở hữu sẵn 1 ô): các ô số `0, 3, 5, 8, 10, 13, 15` của vòng ngoài lần lượt cho Nhóm 1–7 (khoảng cách 3-2-3-2-3-2-3).
- 29 ô còn lại là ô trống.
- Nhóm chưa có thành viên lúc bắt đầu Bàn Cờ không nhận ô xuất phát (ô đó là ô trống). Nếu sau đó có người vào nhóm, nhóm chơi theo luật "nhóm không còn ô nào".
- Ô kề: 6 hướng axial `(+1,0) (-1,0) (0,+1) (0,-1) (+1,-1) (-1,+1)`.
- Màu nhóm (gợi ý): N1 `#E53935`, N2 `#FB8C00`, N3 `#43A047`, N4 `#00ACC1`, N5 `#1E88E5`, N6 `#8E24AA`, N7 `#6D4C41`. Ô trống xám nhạt. Mỗi ô có ghi số nhóm để không phụ thuộc hoàn toàn vào màu.

### 3.2 Một lượt (khoảng 50–60 giây)
1. **SELECT (15 giây)** — mỗi nhóm biểu quyết chọn MỘT ô mục tiêu trên bản đồ thu nhỏ ở điện thoại (ô hợp lệ sáng lên).
   - Ô hợp lệ: không thuộc nhóm mình, kề ít nhất một ô của nhóm mình, và không thuộc nhóm đang có khiên. Có thể là ô trống, ô nhóm khác, hoặc ô Hiến pháp.
   - Nhóm không còn ô nào: được chọn bất kỳ ô nào ở vòng ngoài cùng (trừ ô của nhóm có khiên).
   - Nhóm không có ô hợp lệ nào thì bỏ lượt chọn (vẫn trả lời câu hỏi và vẫn phòng thủ ô của mình).
   - SELECT đóng sớm khi mọi nhóm có người và có ô hợp lệ đều đã chốt (như câu hỏi, mục 2.2).
   - Host chỉ hiện mục tiêu của các nhóm SAU khi SELECT kết thúc (lật cùng lúc cho kịch tính).
2. **QUESTION (20 giây)** — một câu kho `board`, cả 7 nhóm cùng trả lời.
3. **REVEAL (~10 giây)** — giải quyết (3.3), hiệu ứng đổi chủ ô, đáp án + giải thích, và chênh lệch mili-giây khi có tranh chấp.

### 3.3 Luật giải quyết — tính đồng thời trên trạng thái ĐẦU lượt
Với mỗi ô bị ít nhất một nhóm nhắm tới:
- Nếu chủ ô đang có khiên: mọi tấn công vô hiệu (thường không xảy ra vì SELECT đã chặn; vẫn kiểm tra để an toàn).
- Ứng viên = các nhóm nhắm ô đó VÀ trả lời đúng.
- Nếu ô có chủ và chủ trả lời đúng: chủ là ứng viên phòng thủ (dù chủ đang nhắm ô khác).
- Người thắng = ứng viên có thời điểm chốt sớm nhất.
  - Nhiều ứng viên cùng sớm nhất (trùng mili-giây — thường gặp khi các nhóm cùng được server tự chốt lúc hết giờ) → không phân định được, ô giữ nguyên.
  - Người thắng là chủ → ô giữ nguyên ("phòng thủ thành công").
  - Người thắng là nhóm tấn công → ô đổi chủ.
- Không có ứng viên → ô giữ nguyên.
- Mỗi nhóm chỉ nhắm 1 ô mỗi lượt nên các ô giải quyết độc lập. Một nhóm có thể vừa mất ô A vừa chiếm ô B trong cùng lượt.
- Không kiểm tra liên thông: lãnh thổ bị chia cắt vẫn giữ nguyên.
- Tính hợp lệ của mục tiêu xét trên trạng thái đầu lượt: nhóm A mất ô X (ô duy nhất kề mục tiêu Y) trong lượt này vẫn chiếm được Y. Mục tiêu không hợp lệ (không kề, ô của mình, ngoài bàn cờ) bị bỏ qua.

### 3.4 Ô Hiến pháp
- Chiếm như ô thường (phải kề lãnh thổ).
- Nhóm vừa chiếm được ô Hiến pháp nhận **Khiên Hiến pháp** cho lượt kế tiếp: mọi ô của nhóm không thể bị tấn công trong lượt đó (pháp luật giữ vị trí tối thượng).
- Khiên chỉ trao một lần mỗi lần chiếm; giữ ô qua các lượt sau không gia hạn khiên.
- Tính điểm cuối trận: ô Hiến pháp = 3 điểm.

### 3.5 Chống "hội đồng"
- Nhóm mất từ 2 ô trở lên trong cùng một lượt nhận **Khiên bảo hộ** cho lượt kế tiếp (tác dụng như Khiên Hiến pháp).
  - Đếm tổng số ô bị chiếm mất, kể cả khi cùng lượt nhóm chiếm được ô khác; nhóm mất hết ô vẫn nhận khiên.
  - Một nhóm có thể nhận cả hai khiên cùng lúc (vừa chiếm ô Hiến pháp vừa mất ≥ 2 ô); tác dụng không cộng dồn, vẫn chỉ một lượt.
- Khiên không cản nhóm có khiên đi tấn công.
- Ô của nhóm có khiên có viền phát sáng trên host và không sáng lên là mục tiêu trên điện thoại nhóm khác.

### 3.6 Kết thúc và tính điểm
- Kết thúc sau N lượt (mặc định 14). Admin chỉnh được N và có nút "Kết thúc sau lượt này".
- Điểm = số ô sở hữu (ô Hiến pháp tính 3).
- Tiêu chí phụ khi hòa: (1) tổng số câu đúng cả trận, (2) tổng thời gian chốt của các câu đúng (ít hơn xếp trên). Thời gian chốt của một câu = từ lúc câu mở tới lúc server ghi nhận chốt (câu đúng do tự chốt khi hết giờ tính bằng cả thời lượng câu). Bằng nhau cả ba tiêu chí → đồng hạng.
- Bàn cờ và điểm được giữ nguyên để chơi tiếp Quả Bom.

## 4. Quả Bom Tham Nhũng

### 4.1 Tổng quan
- Chơi trên chính bàn cờ sau khi Bàn Cờ kết thúc. Mặc định 3 quả bom (admin chọn 1–5 khi bắt đầu), lần lượt từng quả.
- Hết lượt Bàn Cờ cuối → pha **BOMB_INTRO**: host hiện luật Quả Bom, bảng điểm và nhóm cầm bom đầu tiên; admin bấm "Bắt đầu Quả Bom" thì mới chơi. Khiên của Bàn Cờ bị xóa.
- Mỗi lúc chỉ nhóm đang cầm bom trả lời. Điện thoại các nhóm khác hiện câu hỏi ở chế độ chỉ xem.
- Câu bom trả lời xong được tính vào thống kê tiêu chí phụ ở 3.6 (số câu đúng, thời gian chốt) như câu Bàn Cờ.

### 4.2 Ngòi nổ (bí mật)
- Mỗi quả có ngòi ngẫu nhiên 30–60 giây (cấu hình được), CHỈ trừ dần trong pha QUESTION của nhóm cầm bom. Tạm dừng trong REVEAL và PASS.
- Giá trị ngòi và thời gian còn lại chỉ tồn tại trên server. Client chỉ biết trạng thái "đang cháy" hoặc "tạm dừng". Nhịp tích tắc ở client cố định hoặc ngẫu nhiên, KHÔNG phụ thuộc thời gian còn lại.
- Hết ngòi → nổ ngay lập tức, kể cả giữa câu hỏi (câu hỏi bị hủy: không công bố đáp án, không tính thống kê).
- Câu hỏi đóng (chốt hoặc hết giờ) đúng vào mili-giây ngòi hết → tính là nổ.
- Admin bỏ qua câu lỗi trong lúc bom cháy → thay câu khác, ngòi cháy liên tục.

### 4.3 Một vòng chuyền
1. **QUESTION (12 giây)**: nhóm cầm bom nhận một câu kho `bomb`, biểu quyết như 2.2. Ngòi cháy.
2. **REVEAL (8 giây)**: đáp án + giải thích như mọi câu (2.3). Ngòi tạm dừng.
3. Đúng → **PASS (10 giây)**: nhóm biểu quyết chọn nhóm nhận bom. Ngòi tạm dừng.
   - Nhóm hợp lệ: các nhóm khác CÓ THÀNH VIÊN, TRỪ nhóm vừa chuyền bom cho mình. Nếu ngoài nhóm vừa chuyền không còn nhóm nào (vd. chỉ 2 nhóm) thì được chuyền lại cho nhóm đó. Chỉ có một nhóm chơi → bỏ PASS, nhóm đó trả lời tiếp.
   - Hết giờ không chốt → tự chốt theo phiếu như 2.2; không có phiếu nào → server chọn ngẫu nhiên một nhóm hợp lệ.
   - Host vẽ mũi tên bom bay sang nhóm nhận.
4. Sai hoặc hết giờ → sau REVEAL là câu hỏi mới ngay (không qua PASS), bom vẫn ở nhóm đó.
5. **Nổ** (pha EXPLODE, khoảng 6 giây): nhóm đang cầm bom mất 2 ô chọn ngẫu nhiên trong các ô của nhóm (ô trở thành ô trống; ô Hiến pháp cũng có thể mất). Còn ≤ 2 ô thì mất hết. Hiệu ứng nổ lớn trên host + âm thanh.

### 4.4 Ai cầm bom đầu tiên
- Quả 1: nhóm đang dẫn đầu (theo 3.6).
- Quả 2 và 3: nhóm dẫn đầu hiện tại, trừ nhóm vừa bị nổ; nếu nhóm dẫn đầu vừa bị nổ thì chọn nhóm xếp ngay sau.
- Chỉ xét nhóm có thành viên. Đồng hạng → nhóm số nhỏ hơn.

### 4.5 Kết thúc
- Sau quả bom cuối → SUMMARY. Xếp hạng theo điểm ở 3.6.

## 5. Màn hình

### 5.1 `/host` — máy chiếu 16:9, chữ to đọc được từ cuối lớp
- **LOBBY**: mã QR lớn + URL + mã phòng; 7 cột nhóm với số người và tên đã vào.
- **RULES**: luật tóm tắt, có minh họa.
- **BOARD**: bàn cờ chiếm khoảng 65% chiều ngang. Thanh bên: 7 nhóm (màu, tên, số điểm, khiên). Trên cùng: tên pha + đồng hồ đếm ngược. Pha QUESTION: câu hỏi và phương án hiển thị lớn. Pha REVEAL: đáp án, giải thích, hiệu ứng đổi màu ô, tên nhóm thắng tranh chấp kèm chênh lệch ms.
- **BOMB**: quả bom lớn trên nhãn nhóm đang cầm, dây cháy (không lộ thời gian), mũi tên chuyền bom.
- **SUMMARY**: bục vinh danh top 3, bảng đầy đủ, sau đó màn tổng kết 6 đặc điểm của nhà nước pháp quyền XHCN Việt Nam (lấy từ `docs/CONTENT.md`).
- Nút tắt/bật âm thanh.

### 5.2 `/play` — điện thoại, màn dọc, nút cao ≥ 56px
- Vào phòng: nhập tên → chọn nhóm (7 nút màu).
- Màn chờ giữa các pha. SELECT: bản đồ thu nhỏ, chạm để chọn ô. QUESTION: câu hỏi + nút phương án. PASS: danh sách nhóm hợp lệ.
- Luôn hiện phiếu trực tiếp của nhóm mình. Đội trưởng thấy nút CHỐT.
- Rung nhẹ (`navigator.vibrate`, nếu hỗ trợ) khi câu mới bắt đầu và khi bom chuyền tới nhóm mình.

### 5.3 `/admin` — người dẫn; bảo vệ bằng mật khẩu từ biến môi trường `ADMIN_PASSWORD`
- Tạo phòng; mở/đóng LOBBY; bắt đầu từng pha; tạm dừng/tiếp tục; bỏ qua câu lỗi; "Kết thúc Bàn Cờ sau lượt này".
- Chỉnh tay: đổi chủ ô, đổi đội trưởng, chuyển người chơi sang nhóm khác.
- **Chế độ dự phòng**: khi mạng sập, các nhóm giơ thẻ màu A/B/C/D; admin nhập ô mục tiêu, đáp án và thứ tự nhanh chậm cho từng nhóm; trò chơi vẫn chạy trên host.
- Nhật ký sự kiện (ai chiếm ô nào, ai phòng thủ, bom nổ ở đâu) để giải quyết tranh cãi.

## 6. Yêu cầu kỹ thuật
- Server: Node.js + TypeScript + Express + Socket.IO. Máy trạng thái rõ ràng:
  `LOBBY → RULES → (BOARD_SELECT → BOARD_QUESTION → BOARD_REVEAL) × N → BOMB_INTRO → (BOMB_QUESTION ↔ BOMB_REVEAL → BOMB_PASS … → BOMB_EXPLODE) × số bom → SUMMARY`.
- Mọi timer chạy trên server. Có tạm dừng/tiếp tục toàn cục.
- Logic game là hàm thuần trong `shared/`, có unit test (Vitest): ô kề, mục tiêu hợp lệ, biểu quyết nhóm, giải quyết lượt, khiên, bom, xếp hạng.
- Test bắt buộc: không payload nào gửi tới client chứa ngòi bom hoặc đáp án đúng khi câu còn mở.
- Lưu trạng thái trận ra file JSON mỗi khi đổi pha; khởi động lại server thì khôi phục trận đang chơi (nếu file mới hơn 3 giờ).
- Tải: 1 phòng, khoảng 65 kết nối đồng thời + host + admin. Chỉ broadcast dữ liệu cần thiết.
- `scripts/simulate.ts`: 63 bot (7 × 9) vào phòng, bỏ phiếu ngẫu nhiên, bot đội trưởng chốt ở thời điểm ngẫu nhiên, chạy trọn một trận.
- Âm thanh: tạo bằng Web Audio API (khỏi lo bản quyền file): câu mới, 5 giây cuối, chiếm ô, mất ô, tích tắc, nổ, chiến thắng.
- Deploy: một service trên Render/Railway, server phục vụ client đã build. Không dùng Vercel cho Socket.IO.

## 7. Nhật ký quyết định
- Chọn Bàn Cờ Quyền Lực + Quả Bom Tham Nhũng vì tính đối kháng trực tiếp giữa các nhóm cao nhất.
- Gộp hai trò trên một bàn cờ để có một bảng xếp hạng duy nhất; bom nổ = mất ô, đội dẫn đầu vẫn có thể bị lật cuối trận.
- Socket.IO thay vì Firebase/Supabase: cần server làm trọng tài và giấu ngòi bom.
- Biểu quyết đa số, hòa thì đội trưởng quyết: ai cũng tham gia, minh họa tập trung dân chủ.
- Nút CHỐT cần quá nửa thành viên online đã bỏ phiếu: tránh đội trưởng chốt sớm một mình.
- Ngòi bom 30–60 giây (thay cho 60–120 giây trong ý tưởng ban đầu) vì chỉ đếm thời gian trả lời; mỗi quả khoảng 2–3 phút thực.
- Bàn cờ lục giác bán kính 3 (37 ô) với 7 ô xuất phát cách đều gần nhất có thể trên vòng ngoài.
- Câu hỏi đóng sớm khi mọi nhóm có người đã chốt: bớt thời gian chờ; không ảnh hưởng công bằng vì thứ tự vẫn tính theo thời điểm chốt.
- Tranh ô mà các ứng viên sớm nhất trùng mili-giây → ô giữ nguyên: không có cách công bằng để phân định (nhất là khi cùng bị tự chốt lúc hết giờ); khuyến khích đội trưởng chủ động CHỐT.
- Nhóm không có thành viên lúc bắt đầu Bàn Cờ không nhận ô xuất phát: tránh "ô ma" không bao giờ phòng thủ được bị nhóm bên cạnh chiếm miễn phí.
- Khiên bảo hộ đếm tổng số ô mất (không trừ ô chiếm được): luật đơn giản, dễ giải thích trên lớp.
- Thêm pha BOMB_INTRO do admin bắt đầu: lớp cần nghe luật Quả Bom trước khi chơi.
- Câu bom sai vẫn có REVEAL (ngòi dừng): giữ nguyên tắc "sau mỗi câu là lúc học" của 2.3.
- Hết giờ PASS: có phiếu thì theo đa số (nhất quán với 2.2), không phiếu mới chọn ngẫu nhiên.
- Chỉ chuyền bom cho nhóm có thành viên; được chuyền ngược khi không còn lựa chọn nào khác, để trận không kẹt khi lớp ít nhóm.
- Câu bị hủy do nổ không công bố đáp án, không tính thống kê. Câu bom trả lời xong tính vào tiêu chí phụ ("cả trận").
- Ngòi và thời gian còn lại chỉ nằm trong bộ nhớ server; client (kể cả admin) chỉ biết bom đang cháy hay dừng. Có test so sánh hai phòng khác nhau duy nhất ở ngòi: mọi payload trước khi nổ phải giống hệt nhau.
