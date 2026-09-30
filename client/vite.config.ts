import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const SERVER_URL = `http://localhost:${process.env.PORT || 3000}`;

export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // cho điện thoại cùng mạng LAN truy cập khi thử
    port: 5173,
    proxy: {
      '/socket.io': { target: SERVER_URL, ws: true },
      '/api': { target: SERVER_URL },
    },
  },
});
