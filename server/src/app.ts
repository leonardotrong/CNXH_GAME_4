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
import { readSnapshot, writeSnapshot } from './persistence';
import { DEFAULT_TIMING, Room, RoomRegistry, type RoomTiming, type VoteKind } from './room';

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
  /** File lưu trạng thái trận để khôi phục sau khi khởi động lại (null/không có = không lưu). */
  stateFile?: string | null;
}

const channel = (code: string) => `room:${code}`;
const adminChannel = (code: string) => `admin:${code}`;
/** Gộp các lần ghi file trạng thái trong khoảng này. */
const SAVE_DEBOUNCE_MS = 250;
const HOSTS_CHANNEL = 'hosts';

export interface AppServer {
  httpServer: HttpServer;
  io: GameIo;
  /** Ghi ngay mọi trạng thái đang chờ lưu (gọi trước khi tắt server). */
  flush: () => void;
}

export function createAppServer(options: AppServerOptions = {}): AppServer {
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
  // Nhịp tim ngắn hơn mặc định (25 s + 20 s): điện thoại khóa màn hình/mất sóng bị tính offline sau ≤ 20 s thay vì 45 s,
  // để người đã rời máy không chặn "cả nhóm bầu xong là tự chốt" và mốc "quá nửa" của nút CHỐT.
  const io: GameIo = new Server(httpServer, { pingInterval: 10_000, pingTimeout: 10_000 });
  const durations: RoomTiming = { ...DEFAULT_TIMING, ...options.durations };
  const registry = new RoomRegistry(Date.now, durations);
  const adminPassword = options.adminPassword ?? process.env.ADMIN_PASSWORD;
  // Rỗng coi như không đặt (vd. ô để trống trên dashboard Render); nếu không, QR thành "/play?room=…" và điện thoại không mở được.
  const publicUrl = (options.publicUrl ?? process.env.PUBLIC_URL)?.trim() || null;

  const questions = options.questions ?? loadQuestionBank();

  /** Gửi phiếu (câu hỏi, chọn ô, chọn nhóm nhận bom) của từng nhóm cho riêng thành viên nhóm đó (không bao giờ broadcast chung). */
  const emitTeamViews = (room: Room, onlyTeam?: number) => {
    const views = new Map<number, [ReturnType<Room['teamQuestion']>, ReturnType<Room['teamSelect']>, ReturnType<Room['teamPass']>]>();
    for (const s of io.sockets.sockets.values()) {
      if (s.data.roomCode !== room.code || !s.data.playerId) continue;
      const teamId = room.teamOf(s.data.playerId);
      if (teamId === null || (onlyTeam !== undefined && teamId !== onlyTeam)) continue;
      if (!views.has(teamId)) views.set(teamId, [room.teamQuestion(teamId), room.teamSelect(teamId), room.teamPass(teamId)]);
      const [question, select, pass] = views.get(teamId)!;
      s.emit('question:team', question);
      s.emit('select:team', select);
      s.emit('pass:team', pass);
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
    if (room.question || room.select || room.pass) emitTeamViews(room);
  };

  // ─── Lưu trạng thái (GAME_SPEC 6): ghi gộp sau mỗi thay đổi, file chỉ nằm trên server ───
  // Chỉ một file → chỉ lưu phòng mới nhất: điện thoại còn ở phòng cũ (vd. chơi thử) vào lại không được ghi đè phòng đang chơi.
  const stateFile = options.stateFile ?? null;
  const pendingSaves = new Map<string, NodeJS.Timeout>();
  const saveNow = (room: Room) => {
    clearTimeout(pendingSaves.get(room.code));
    pendingSaves.delete(room.code);
    if (!stateFile || registry.getLatest() !== room) return;
    try {
      writeSnapshot(stateFile, room.toSnapshot());
    } catch (err) {
      console.error(`[server] Không lưu được trạng thái phòng ${room.code}:`, err);
    }
  };
  const persist = (room: Room) => {
    if (!stateFile || registry.getLatest() !== room || pendingSaves.has(room.code)) return;
    const t = setTimeout(() => saveNow(room), SAVE_DEBOUNCE_MS);
    t.unref();
    pendingSaves.set(room.code, t);
  };
  if (stateFile) {
    const snap = readSnapshot(stateFile);
    if (snap) {
      const room = Room.fromSnapshot(snap, Date.now, durations);
      registry.adopt(room);
      console.log(`[server] Khôi phục phòng ${room.code} ở pha ${room.phase}${room.pausedAt !== null ? ' (đang tạm dừng)' : ''}.`);
    }
  }

  // ─── Nhật ký: chỉ gửi cho admin đã đăng nhập ─────────────────────────────
  const sentLog = new Map<string, number>();
  const emitLog = (room: Room, force = false) => {
    if (!force && sentLog.get(room.code) === room.logLength) return;
    sentLog.set(room.code, room.logLength);
    io.to(adminChannel(room.code)).emit('admin:log', room.log());
  };

  // ─── Đồng hồ: MỘT timer mỗi phòng, đặt tại room.nextDeadline() ───────────
  // Với Quả Bom, hạn này đã tính ngòi (min(hạn câu, hạn ngòi)) — chỉ dùng trong server, không gửi đi.
  const timers = new Map<string, NodeJS.Timeout>();
  const clearTimer = (room: Room) => {
    clearTimeout(timers.get(room.code));
    timers.delete(room.code);
  };
  const arm = (room: Room) => {
    clearTimer(room);
    const at = room.nextDeadline();
    if (at === null) return;
    const t = setTimeout(() => {
      const due = room.nextDeadline();
      if (due === null) return;
      // setTimeout có thể chạy sớm ~1 ms, hoặc hạn đã đổi: chưa tới hạn thì đặt lại.
      if (Date.now() < due) return arm(room);
      const res = room.advance(questions);
      if (!res.ok) {
        console.error(`[server] Phòng ${room.code}: không chuyển được pha ${room.phase} (${res.error})`);
        emitAll(room);
        return;
      }
      changed(room);
    }, Math.max(0, at - Date.now()));
    t.unref();
    timers.set(room.code, t);
  };
  /** Sau mỗi thay đổi trạng thái trận: phát cho mọi người, ghi nhật ký cho admin, lưu file, đặt lại timer. */
  const changed = (room: Room) => {
    emitAll(room);
    emitLog(room);
    persist(room);
    arm(room);
  };

  /** Một nhóm vừa chốt (đội trưởng hoặc tự chốt): đóng sớm nếu mọi nhóm đã chốt, nếu không chỉ phát lại phần liên quan. */
  const afterLock = (room: Room, res: { teamId: number; kind: VoteKind }) => {
    if (room.everyoneLocked()) {
      // Đóng sớm: SELECT → câu hỏi, câu → REVEAL (câu bom: Room tự quyết nổ nếu ngòi hết đúng lúc chốt), PASS → câu mới.
      const adv = room.advance(questions);
      if (!adv.ok) console.error(`[server] Phòng ${room.code}: không đóng sớm được (${adv.error})`);
      return changed(room);
    }
    if (res.kind === 'question') emitQuestion(room);
    else emitGame(room);
    emitTeamViews(room, res.teamId);
  };

  io.on('connection', (socket) => {
    socket.emit('server:hello', { serverTime: Date.now() });
    socket.on('client:ping', (ack) => {
      if (typeof ack === 'function') ack(Date.now());
    });

    const watch = (room: Room) => {
      if (socket.data.roomCode) {
        void socket.leave(channel(socket.data.roomCode));
        void socket.leave(adminChannel(socket.data.roomCode));
      }
      socket.data.roomCode = room.code;
      void socket.join(channel(room.code));
      if (socket.data.isAdmin) {
        void socket.join(adminChannel(room.code));
        socket.emit('admin:log', room.log());
      }
      socket.emit('room:state', room.snapshot());
      socket.emit('game:state', room.publicGame());
      socket.emit('question:state', room.publicQuestion());
      const teamId = socket.data.playerId ? room.teamOf(socket.data.playerId) : null;
      if (teamId !== null) {
        socket.emit('question:team', room.teamQuestion(teamId));
        socket.emit('select:team', room.teamSelect(teamId));
        socket.emit('pass:team', room.teamPass(teamId));
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
      persist(room);
      done(ack, res);
    });

    socket.on('player:changeTeam', (req, ack) => {
      const room = registry.get(socket.data.roomCode);
      if (!room || !socket.data.playerId) return done(ack, { ok: false, error: 'PLAYER_NOT_FOUND' });
      const res = room.changeTeam(socket.data.playerId, req?.teamId);
      if (res.ok) {
        broadcast(room);
        persist(room);
      }
      done(ack, res);
    });

    socket.on('player:vote', (req, ack) => {
      const room = registry.get(socket.data.roomCode);
      if (!room || !socket.data.playerId) return done(ack, { ok: false, error: 'PLAYER_NOT_FOUND' });
      const res = room.vote(socket.data.playerId, req?.roundId, req?.option);
      if (!res.ok) return done(ack, res);
      done(ack, { ok: true });
      // Phiếu này làm nhóm tự chốt (mọi thành viên online đã bầu): xử lý như lệnh CHỐT.
      if (res.locked) return afterLock(room, res);
      emitTeamViews(room, res.teamId);
    });

    socket.on('player:lock', (req, ack) => {
      const room = registry.get(socket.data.roomCode);
      if (!room || !socket.data.playerId) return done(ack, { ok: false, error: 'PLAYER_NOT_FOUND' });
      const res = room.lock(socket.data.playerId, req?.roundId);
      if (!res.ok) return done(ack, res);
      done(ack, { ok: true });
      afterLock(room, res);
    });

    socket.on('admin:login', (req, ack) => {
      const ok = !!adminPassword && typeof req?.password === 'string' && req.password === adminPassword;
      socket.data.isAdmin = ok;
      done(ack, ok ? { ok: true } : { ok: false, error: 'UNAUTHORIZED' });
    });

    socket.on('admin:createRoom', (ack) => {
      if (!socket.data.isAdmin) return done(ack, { ok: false, error: 'UNAUTHORIZED' });
      const previous = registry.getLatest();
      if (previous) clearTimer(previous);
      const room = registry.create();
      io.to(HOSTS_CHANNEL).emit('room:created', { code: room.code });
      watch(room);
      saveNow(room);
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
      persist(room);
      done(ack, { ok: true });
    });

    socket.on('admin:setCaptain', (req, ack) => {
      const room = adminRoom(ack);
      if (!room) return;
      const res = room.setCaptain(req?.playerId);
      if (res.ok) {
        broadcast(room);
        emitLog(room);
        persist(room);
      }
      done(ack, res);
    });

    socket.on('admin:startQuestion', (req, ack) => {
      const room = adminRoom(ack);
      if (!room) return;
      const pool: QuestionPool = req?.pool === 'bomb' ? 'bomb' : 'board';
      const res = room.startTestQuestion(questions, pool, durations[pool]);
      if (!res.ok) return done(ack, res);
      changed(room);
      done(ack, { ok: true, roundId: res.round.roundId });
    });

    socket.on('admin:skipQuestion', (ack) => {
      const room = adminRoom(ack);
      if (!room) return;
      if (!room.question) return done(ack, { ok: false, error: 'NO_QUESTION' });
      let res: { ok: boolean; error?: string };
      if (room.phase === 'BOARD_QUESTION') res = room.replaceBoardQuestion(questions);
      else if (room.phase === 'BOMB_QUESTION') res = room.replaceBombQuestion(questions);
      else if (room.phase === 'LOBBY' || room.phase === 'RULES' || room.phase === 'SUMMARY') {
        room.clearQuestion();
        res = { ok: true };
      } else res = { ok: false, error: 'WRONG_PHASE' };
      if (!res.ok) return done(ack, res);
      changed(room);
      done(ack, { ok: true });
    });

    socket.on('admin:startBoard', (req, ack) => {
      const room = adminRoom(ack);
      if (!room) return;
      const res = room.startBoard(questions, req?.totalTurns);
      if (!res.ok) return done(ack, res);
      changed(room);
      done(ack, { ok: true });
    });

    socket.on('admin:startBomb', (req, ack) => {
      const room = adminRoom(ack);
      if (!room) return;
      const res = room.startBombs(questions, req?.totalBombs);
      if (!res.ok) return done(ack, res);
      changed(room);
      done(ack, { ok: true });
    });

    socket.on('admin:setBoardTurns', (req, ack) => {
      const room = adminRoom(ack);
      if (!room) return;
      const res = room.setBoardTurns(req?.totalTurns);
      if (res.ok) changed(room);
      done(ack, res);
    });

    socket.on('admin:endBoardAfterTurn', (req, ack) => {
      const room = adminRoom(ack);
      if (!room) return;
      const res = room.setEndAfterThisTurn(req?.value === true);
      if (res.ok) changed(room);
      done(ack, res);
    });

    socket.on('admin:movePlayer', (req, ack) => {
      const room = adminRoom(ack);
      if (!room) return;
      const res = room.movePlayer(req?.playerId, req?.teamId);
      if (res.ok) {
        broadcast(room);
        emitLog(room);
        persist(room);
      }
      done(ack, res);
    });

    /** Lệnh admin đổi trạng thái trận: chạy `action`, phát lại + lưu + đặt timer nếu thành công. */
    const adminAction = (ack: unknown, action: (room: Room) => { ok: boolean; error?: string }) => {
      const room = adminRoom(ack);
      if (!room) return;
      const res = action(room);
      if (res.ok) changed(room);
      else emitLog(room);
      done(ack, res.ok ? { ok: true } : res);
    };

    socket.on('admin:showRules', (ack) => adminAction(ack, (room) => room.showRules()));
    socket.on('admin:setPaused', (req, ack) => adminAction(ack, (room) => (req?.paused === true ? room.pause() : room.resume())));
    socket.on('admin:setCellOwner', (req, ack) => adminAction(ack, (room) => room.setCellOwner(req?.cellId, req?.owner)));
    socket.on('admin:setSummaryView', (req, ack) => adminAction(ack, (room) => room.setSummaryView(req?.view)));
    socket.on('admin:setFallback', (req, ack) => adminAction(ack, (room) => room.setFallback(req?.on === true)));
    socket.on('admin:fallbackSelect', (req, ack) => adminAction(ack, (room) => room.fallbackSelect(questions, req?.targets)));
    socket.on('admin:fallbackAnswers', (req, ack) => adminAction(ack, (room) => room.fallbackAnswers(req?.answers)));
    socket.on('admin:fallbackPass', (req, ack) => adminAction(ack, (room) => room.fallbackPass(questions, req?.to)));

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

  const flush = () => {
    for (const code of [...pendingSaves.keys()]) {
      const room = registry.get(code);
      if (room) saveNow(room);
    }
  };

  return { httpServer, io, flush };
}
