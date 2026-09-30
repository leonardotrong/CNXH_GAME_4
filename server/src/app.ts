import { existsSync } from 'node:fs';
import { createServer, type Server as HttpServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { Server } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from '@cnxh/shared';

export type GameIo = Server<ClientToServerEvents, ServerToClientEvents>;

const CLIENT_DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../client/dist');

export interface AppServerOptions {
  /** Phục vụ bản build của client (production). */
  serveClient?: boolean;
}

export function createAppServer(options: AppServerOptions = {}): { httpServer: HttpServer; io: GameIo } {
  const app = express();

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, serverTime: Date.now() });
  });

  if (options.serveClient) {
    if (!existsSync(CLIENT_DIST)) {
      console.warn(`[server] Chưa có bản build client tại ${CLIENT_DIST} — hãy chạy "npm run build".`);
    }
    app.use(express.static(CLIENT_DIST));
    // SPA: /host, /play, /admin đều trả về index.html
    app.get(['/', '/host', '/play', '/admin'], (_req, res) => {
      res.sendFile(path.join(CLIENT_DIST, 'index.html'));
    });
  }

  const httpServer = createServer(app);
  const io: GameIo = new Server(httpServer);

  io.on('connection', (socket) => {
    socket.emit('server:hello', { serverTime: Date.now() });
    socket.on('client:ping', (ack) => {
      if (typeof ack === 'function') ack(Date.now());
    });
  });

  return { httpServer, io };
}
