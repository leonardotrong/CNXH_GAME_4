import { existsSync } from 'node:fs';
import { createServer, type Server as HttpServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { Server } from 'socket.io';
import {
  CAPTAIN_GRACE_MS,
  isRoomCode,
  type Question,
  type QuestionPool,
  type ClientToServerEvents,
  type ServerToClientEvents,
} from '@cnxh/shared';
import { loadQuestionBank } from './questionBank';
import { DEFAULT_TIMING, RoomRegistry, type Room, type RoomTiming } from './room';

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
  /** Ngân hàng câu hỏi (mặc định đọc data/questions.json). */
  questions?: Question[];
  /** Ghi đè thời lượng các pha (ms) — dùng cho test. */
  durations?: Partial<RoomTiming>;
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
  const durations: RoomTiming = { ...DEFAULT_TIMING, ...options.durations };
  const registry = new RoomRegistry(Date.now, durations);
  const adminPassword = options.adminPassword ?? process.env.ADMIN_PASSWORD;
  const publicUrl = options.publicUrl ?? process.env.PUBLIC_URL ?? null;

  const questions = options.questions ?? loadQuestionBank();

  /** Gửi phiếu (câu hỏi + chọn ô) của từng nhóm cho riêng thành viên nhóm đó (không bao giờ broadcast chung). */
  const emitTeamViews = (room: Room, onlyTeam?: number) => {
    const views = new Map<number, [ReturnType<Room['teamQuestion']>, ReturnType<Room['teamSelect']>]>();
    for (const s of io.sockets.sockets.values()) {
      if (s.data.roomCode !== room.code || !s.data.playerId) continue;
      const teamId = room.teamOf(s.data.playerId);
      if (teamId === null || (onlyTeam !== undefined && teamId !== onlyTeam)) continue;
      if (!views.has(teamId)) views.set(teamId, [room.teamQuestion(teamId), room.teamSelect(teamId)]);
      const [question, select] = views.get(teamId)!;
      s.emit('question:team', question);
      s.emit('select:team', select);
    }
  };
  const emitQuestion = (room: Room) => io.to(channel(room.code)).emit('question:state', room.publicQuestion());
  const emitGame = (room: Room) => io.to(channel(room.code)).emit('game:state', room.publicGame());
  const emitAll = (room: Room) => {
    emitGame(room);
    emitQuestion(room);
    emitTeamViews(room);
  };
  /** Trạng thái phòng thay đổi (vào/ra/đổi nhóm/đổi đội trưởng): số online và đội trưởng ảnh hưởng tới nút CHỐT. */
  const broadcast = (room: Room) => {
    io.to(channel(room.code)).emit('room:state', room.snapshot());
    if (room.question || room.select) emitTeamViews(room);
  };

  // Timer câu hỏi — chạy hoàn toàn trên server.
  const questionTimers = new Map<string, NodeJS.Timeout>();
  const clearQuestionTimer = (room: Room) => {
    clearTimeout(questionTimers.get(room.code));
    questionTimers.delete(room.code);
  };
  const schedule = (room: Room, ms: number, fn: () => void) => {
    clearQuestionTimer(room);
    const t = setTimeout(fn, Math.max(0, ms));
    t.unref();
    questionTimers.set(room.code, t);
  };
  // ─── Lượt Bàn Cờ: SELECT → QUESTION → REVEAL → lượt kế ───────────────────
  const runSelect = (room: Room) => {
    const { roundId, endsAt } = room.select!;
    schedule(room, endsAt - Date.now(), () => endSelect(room, roundId));
  };
  const runBoardQuestion = (room: Room) => {
    const { roundId, endsAt } = room.question!;
    schedule(room, endsAt - Date.now(), () => endBoardQuestion(room, roundId));
  };
  const endSelect = (room: Room, roundId: number) => {
    if (room.phase !== 'BOARD_SELECT' || room.select?.roundId !== roundId) return;
    const res = room.endSelect(questions);
    if (!res.ok) console.error(`[server] Phòng ${room.code}: không mở được câu hỏi Bàn Cờ (${res.error})`);
    else runBoardQuestion(room);
    emitAll(room);
  };
  const endBoardQuestion = (room: Room, roundId: number) => {
    if (room.phase !== 'BOARD_QUESTION' || room.question?.roundId !== roundId || room.question.status !== 'open') return;
    room.endBoardQuestion();
    const turn = room.match!.turn;
    schedule(room, durations.boardReveal, () => advanceTurn(room, turn));
    emitAll(room);
  };
  const advanceTurn = (room: Room, turn: number) => {
    if (room.phase !== 'BOARD_REVEAL' || room.match?.turn !== turn) return;
    room.advanceTurn();
    if (room.select?.status === 'open') runSelect(room);
    emitAll(room);
  };

  /** Câu thử (ngoài trận). */
  const finishQuestion = (room: Room, roundId: number) => {
    if (room.question?.roundId !== roundId || room.question.status !== 'open') return;
    room.closeQuestion();
    emitQuestion(room);
    emitTeamViews(room);
    schedule(room, durations.reveal, () => {
      if (room.question?.roundId !== roundId) return;
      room.clearQuestion();
      emitQuestion(room);
      emitTeamViews(room);
    });
  };

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
      socket.emit('game:state', room.publicGame());
      socket.emit('question:state', room.publicQuestion());
      const teamId = socket.data.playerId ? room.teamOf(socket.data.playerId) : null;
      if (teamId !== null) {
        socket.emit('question:team', room.teamQuestion(teamId));
        socket.emit('select:team', room.teamSelect(teamId));
      }
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

    socket.on('player:vote', (req, ack) => {
      const room = registry.get(socket.data.roomCode);
      if (!room || !socket.data.playerId) return done(ack, { ok: false, error: 'PLAYER_NOT_FOUND' });
      const res = room.vote(socket.data.playerId, req?.roundId, req?.option);
      if (!res.ok) return done(ack, res);
      emitTeamViews(room, res.teamId);
      done(ack, { ok: true });
    });

    socket.on('player:lock', (req, ack) => {
      const room = registry.get(socket.data.roomCode);
      if (!room || !socket.data.playerId) return done(ack, { ok: false, error: 'PLAYER_NOT_FOUND' });
      const res = room.lock(socket.data.playerId, req?.roundId);
      if (!res.ok) return done(ack, res);
      done(ack, { ok: true });
      if (res.kind === 'select') {
        if (room.selectAllLocked()) return endSelect(room, room.select!.roundId);
        emitGame(room);
        return emitTeamViews(room, res.teamId);
      }
      if (room.allLocked()) {
        const { roundId } = room.question!;
        return room.phase === 'BOARD_QUESTION' ? endBoardQuestion(room, roundId) : finishQuestion(room, roundId);
      }
      emitQuestion(room);
      emitTeamViews(room, res.teamId);
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

    socket.on('admin:startQuestion', (req, ack) => {
      const room = adminRoom(ack);
      if (!room) return;
      if (room.phase !== 'LOBBY' && room.phase !== 'SUMMARY') return done(ack, { ok: false, error: 'WRONG_PHASE' });
      const pool: QuestionPool = req?.pool === 'bomb' ? 'bomb' : 'board';
      const res = room.startQuestion(questions, pool, { durationMs: durations[pool] });
      if (!res.ok) return done(ack, res);
      const { roundId, endsAt } = res.round;
      schedule(room, endsAt - Date.now(), () => finishQuestion(room, roundId));
      emitQuestion(room);
      emitTeamViews(room);
      done(ack, { ok: true, roundId });
    });

    socket.on('admin:skipQuestion', (ack) => {
      const room = adminRoom(ack);
      if (!room) return;
      if (!room.question) return done(ack, { ok: false, error: 'NO_QUESTION' });
      if (room.phase === 'BOARD_QUESTION') {
        const res = room.replaceBoardQuestion(questions);
        if (!res.ok) return done(ack, res);
        runBoardQuestion(room);
        emitAll(room);
        return done(ack, { ok: true });
      }
      if (room.phase !== 'LOBBY' && room.phase !== 'SUMMARY') return done(ack, { ok: false, error: 'WRONG_PHASE' });
      clearQuestionTimer(room);
      room.clearQuestion();
      emitQuestion(room);
      emitTeamViews(room);
      done(ack, { ok: true });
    });

    socket.on('admin:startBoard', (req, ack) => {
      const room = adminRoom(ack);
      if (!room) return;
      const res = room.startBoard(questions, req?.totalTurns);
      if (!res.ok) return done(ack, res);
      runSelect(room);
      emitAll(room);
      done(ack, { ok: true });
    });

    socket.on('admin:setBoardTurns', (req, ack) => {
      const room = adminRoom(ack);
      if (!room) return;
      const res = room.setBoardTurns(req?.totalTurns);
      if (res.ok) emitGame(room);
      done(ack, res);
    });

    socket.on('admin:endBoardAfterTurn', (req, ack) => {
      const room = adminRoom(ack);
      if (!room) return;
      const res = room.setEndAfterThisTurn(req?.value === true);
      if (res.ok) emitGame(room);
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
