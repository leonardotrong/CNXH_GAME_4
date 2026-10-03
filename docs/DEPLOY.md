# DEPLOY — Đưa trò chơi lên mạng

Một service duy nhất: server Node (Express + Socket.IO) phục vụ luôn bản build của client. **Không dùng Vercel/Netlify** (không giữ được kết nối WebSocket lâu dài).

**Bản đang chạy của nhóm: https://cnxh-game.onrender.com/** (Render, gói miễn phí, tự deploy lại mỗi khi `main` có commit mới). Hướng dẫn dùng cho người tổ chức buổi chơi nằm ở [README mục 1, Cách 1](../README.md#cách-1--dùng-bản-web-trên-render-không-cần-cài-gì); file này dành cho người quản lý bản deploy hoặc muốn tạo bản mới.

## Render (khuyên dùng)

### Cách 1 — Blueprint (nhanh nhất)
1. Đẩy code lên GitHub.
2. Render Dashboard → **New → Blueprint** → chọn repo. Render đọc `render.yaml`.
3. Nhập `ADMIN_PASSWORD` khi được hỏi (bắt buộc — không có thì không ai vào được `/admin`). `PUBLIC_URL` để trống: QR tự lấy địa chỉ `https://<tên-app>.onrender.com` của trang `/host`.
4. Chờ build xong, mở `https://<tên-app>.onrender.com/admin`.

### Cách 2 — Tạo Web Service thủ công
| Mục | Giá trị |
|---|---|
| Runtime | Node |
| Build Command | `npm ci --include=dev && npm run build` |
| Start Command | `npm start` |
| Health Check Path | `/api/health` |
| Biến môi trường | `ADMIN_PASSWORD=<mật khẩu>`, `NODE_VERSION=22` |

`--include=dev` là cần thiết: Render đặt `NODE_ENV=production` nên `npm ci` mặc định bỏ TypeScript/Vite, không build được client.

### Socket.IO trên Render
- Render hỗ trợ WebSocket sẵn, không cần cấu hình thêm. Client kết nối cùng origin (`io()`), nên không có CORS.
- Chỉ chạy **1 instance** (không bật autoscaling): trạng thái trận nằm trong bộ nhớ của một tiến trình.
- Gói miễn phí "ngủ" sau ~15 phút không có truy cập; lần mở đầu mất 30–60 giây. **Mở `/host` khoảng 15 phút trước giờ học** và để nguyên tab.

### Biến môi trường
| Biến | Bắt buộc | Ý nghĩa |
|---|---|---|
| `ADMIN_PASSWORD` | Có | Mật khẩu vào `/admin` |
| `PUBLIC_URL` | Không | Địa chỉ in trong QR. Mặc định = địa chỉ trang `/host` đang mở |
| `STATE_FILE` | Không | File lưu trạng thái trận (mặc định `server/data/match.json`; đặt rỗng để tắt) |
| `PORT` | Không | Render tự đặt |

### Lưu trạng thái trên Render
Server lưu trận vào `server/data/match.json` và tự khôi phục khi khởi động lại (trận ở trạng thái **tạm dừng** — bấm "Tiếp tục" trên `/admin` khi mọi người đã vào lại). Nhưng trên Render, ổ đĩa không bền: file này **mất mỗi lần service deploy lại, khởi động lại hoặc ngủ**, và Render có thể khởi động lại service gói miễn phí bất cứ lúc nào ([render.com/docs/free](https://render.com/docs/free)). Nghĩa là trên gói miễn phí, server sập giữa trận thì mất trận. Muốn khôi phục được: gói trả phí + Persistent Disk gắn vào `/opt/render/project/src/server/data`.

**Đừng deploy trong giờ học.** Render tự deploy lại mỗi lần có push lên `main`, nên hôm học không ai push lên `main` (hoặc tắt Auto-Deploy trong Settings của service).

## Railway
1. New Project → Deploy from GitHub repo.
2. Settings → Build Command `npm ci --include=dev && npm run build`, Start Command `npm start`, Healthcheck Path `/api/health`.
3. Variables: `ADMIN_PASSWORD`. Networking → Generate Domain.

## Kiểm tra sau khi deploy
1. `https://<app>/api/health` trả `{"ok":true,...}`.
2. Chạy giả lập tải lên chính bản deploy (từ máy của bạn):
   ```bash
   npm run simulate -- --url https://<app>.onrender.com --password <ADMIN_PASSWORD> --real --turns 3 --bombs 1
   ```
   Kết quả phải là `OK — trận chạy trọn vẹn, không lỗi`; xem dòng "Ack" (độ trễ trung bình/tối đa). Lệnh này tạo phòng mới — sau đó bấm "Tạo phòng mới" trên `/admin` trước khi chơi thật.
3. Thử thật với ít nhất 10 điện thoại dùng 4G (ROADMAP Giai đoạn 7): quét QR trên `/host`, chơi 2–3 lượt, tắt mạng một điện thoại 20 giây rồi bật lại → vào lại đúng nhóm.

## Chạy trên mạng LAN (phương án dự phòng không cần Internet)
```bash
npm ci && npm run build
ADMIN_PASSWORD=<mk> PUBLIC_URL=http://<IP-LAN-của-laptop>:3000 npm start
```
Điện thoại và laptop cùng một wifi (hoặc phát wifi từ laptop). Nếu cả wifi lẫn 4G đều hỏng: bật **Chế độ dự phòng** trên `/admin` và chơi bằng thẻ màu A/B/C/D.
