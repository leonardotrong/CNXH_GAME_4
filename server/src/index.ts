import { createAppServer } from './app';
import { DEFAULT_STATE_FILE } from './persistence';

const PORT = Number(process.env.PORT) || 3000;
const isProduction = process.env.NODE_ENV === 'production';
// STATE_FILE="" tắt việc lưu/khôi phục trận.
const stateFile = process.env.STATE_FILE === undefined ? DEFAULT_STATE_FILE : process.env.STATE_FILE || null;

const { httpServer, flush } = createAppServer({ serveClient: isProduction, stateFile });

httpServer.listen(PORT, () => {
  console.log(`[server] Đang chạy tại http://localhost:${PORT} (${isProduction ? 'production' : 'dev'})`);
  if (stateFile) console.log(`[server] Lưu trạng thái trận tại ${stateFile}`);
});

// Render/Railway gửi SIGTERM khi khởi động lại: ghi trạng thái rồi mới thoát.
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    flush();
    process.exit(0);
  });
}
