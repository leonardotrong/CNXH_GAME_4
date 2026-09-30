import { existsSync } from 'node:fs';
import { createServer, type Server as HttpServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { Server } from 'socket.io';
import {
  CAPTAIN_GRACE_MS,
  isRoomCode,
  type ClientToServerEvents,
  type ServerToClientEvents,
} from '@cnxh/shared';
import { RoomRegistry, type Room } from './room';

interface SocketData {
  isAdmin?: boolean;
  roomCode?: string;
  playerId?: string;
}

export type GameIo = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

const CLIENT_DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../client/dist');

export interface AppServerOptions {
  /** Phục vụ bản build của client (production). */
  serveClient?: boolean;
  /** Mật khẩu /admin (mặc định lấy từ ADMIN_PASSWORD). Không có → không ai đăng nhập được. */
  adminPassword?: string;
  /** URL công khai để tạo QR cho điện thoại (mặc định lấy từ PUBLIC_URL). */
  publicUrl?: string;
}

const channel = (code: string) => `room:${code}`;
const HOSTS_CHANNEL = 'hosts';

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
  const registry = new RoomRegistry();
  const adminPassword = options.adminPassword ?? process.env.ADMIN_PASSWORD;
  const publicUrl = options.publicUrl ?? process.env.PUBLIC_URL ?? null;

  const broadcast = (room: Room) => io.to(channel(room.code)).emit('room:state', room.snapshot());

  io.on('connection', (socket) => {
    socket.emit('server:hello', { serverTime: Date.now() });
    socket.on('client:ping', (ack) => {
      if (typeof ack === 'function') ack(Date.now());
    });

    const watch = (room: Room) => {
      if (socket.data.roomCode) void socket.leave(channel(socket.data.roomCode));
      socket.data.roomCode = room.code;
      void socket.join(channel(room.code));
      socket.emit('room:state', room.snapshot());
    };
    /** Bao lệnh admin: kiểm tra đăng nhập + phòng đang theo dõi; ack lỗi nếu thiếu. */
    const adminRoom = (ack: unknown): Room | null => {
      const fail = (error: 'UNAUTHORIZED' | 'NO_ROOM') => {
        if (typeof ack === 'function') ack({ ok: false, error });
        return null;
      };
      if (!socket.data.isAdmin) return fail('UNAUTHORIZED');
      return registry.get(socket.data.roomCode) ?? fail('NO_ROOM');
    };
    const done = (ack: unknown, res: object) => {
      if (typeof ack === 'function') ack(res);
    };

    socket.on('host:watch', (req, ack) => {
      void socket.join(HOSTS_CHANNEL);
      const room = registry.get(req?.roomCode) ?? registry.getLatest();
      if (!room) return done(ack, { ok: false, error: 'NO_ROOM' });
      watch(room);
      done(ack, { ok: true, code: room.code, publicUrl });
    });

    socket.on('player:join', (req, ack) => {
      if (!isRoomCode(req?.roomCode)) return done(ack, { ok: false, error: 'BAD_REQUEST' });
      const room = registry.get(req.roomCode);
      if (!room) return done(ack, { ok: false, error: 'ROOM_NOT_FOUND' });
      const res = room.join(req);
      if (!res.ok) return done(ack, res);
      socket.data.playerId = res.playerId;
      watch(room);
      broadcast(room);
      done(ack, res);
    });

    socket.on('player:changeTeam', (req, ack) => {
      const room = registry.get(socket.data.roomCode);
      if (!room || !socket.data.playerId) return done(ack, { ok: false, error: 'PLAYER_NOT_FOUND' });
      const res = room.changeTeam(socket.data.playerId, req?.teamId);
      if (res.ok) broadcast(room);
      done(ack, res);
    });

    socket.on('admin:login', (req, ack) => {
      const ok = !!adminPassword && typeof req?.password === 'string' && req.password === adminPassword;
      socket.data.isAdmin = ok;
      done(ack, ok ? { ok: true } : { ok: false, error: 'UNAUTHORIZED' });
    });

    socket.on('admin:createRoom', (ack) => {
      if (!socket.data.isAdmin) return done(ack, { ok: false, error: 'UNAUTHORIZED' });
      const room = registry.create();
      io.to(HOSTS_CHANNEL).emit('room:created', { code: room.code });
      watch(room);
      done(ack, { ok: true, code: room.code });
    });

    socket.on('admin:watch', (req, ack) => {
      if (!socket.data.isAdmin) return done(ack, { ok: false, error: 'UNAUTHORIZED' });
      const room = registry.get(req?.roomCode) ?? registry.getLatest();
      if (!room) return done(ack, { ok: false, error: 'NO_ROOM' });
      watch(room);
      done(ack, { ok: true, code: room.code });
    });

    socket.on('admin:setLobbyOpen', (req, ack) => {
      const room = adminRoom(ack);
      if (!room) return;
      room.setLobbyOpen(req?.open === true);
      broadcast(room);
      done(ack, { ok: true });
    });

    socket.on('admin:setCaptain', (req, ack) => {
      const room = adminRoom(ack);
      if (!room) return;
      const res = room.setCaptain(req?.playerId);
      if (res.ok) broadcast(room);
      done(ack, res);
    });

    socket.on('admin:movePlayer', (req, ack) => {
      const room = adminRoom(ack);
      if (!room) return;
      const res = room.movePlayer(req?.playerId, req?.teamId);
      if (res.ok) broadcast(room);
      done(ack, res);
    });

    socket.on('disconnect', () => {
      const { roomCode, playerId } = socket.data;
      const room = registry.get(roomCode);
      if (!room || !playerId) return;
      // Chỉ tính là offline nếu người chơi không còn socket nào khác (vd. mở 2 tab).
      const stillHere = [...io.sockets.sockets.values()].some(
        (s) => s.id !== socket.id && s.data.playerId === playerId && s.data.roomCode === roomCode,
      );
      if (stillHere) return;
      room.disconnect(playerId);
      broadcast(room);
      // Quyền đội trưởng tạm chuyển sau CAPTAIN_GRACE_MS: phát lại trạng thái đúng lúc đó.
      setTimeout(() => broadcast(room), CAPTAIN_GRACE_MS + 50).unref();
    });
  });

  return { httpServer, io };
}
