import { createAppServer } from './app';

const PORT = Number(process.env.PORT) || 3000;
const isProduction = process.env.NODE_ENV === 'production';

const { httpServer } = createAppServer({ serveClient: isProduction });

httpServer.listen(PORT, () => {
  console.log(`[server] Đang chạy tại http://localhost:${PORT} (${isProduction ? 'production' : 'dev'})`);
});
