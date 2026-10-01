/**
 * Giả lập tải (GAME_SPEC 6, ROADMAP Giai đoạn 7): 63 bot (7 nhóm × 9) vào phòng, bỏ phiếu ngẫu nhiên,
 * bot đội trưởng CHỐT ở thời điểm ngẫu nhiên, chạy trọn một trận (Bàn Cờ → Quả Bom → SUMMARY).
 *
 *   npm run simulate                      # server chạy trong tiến trình, thời lượng rút ngắn
 *   npm run simulate -- --turns 3 --bombs 1
 *   npm run simulate -- --url https://ten-app.onrender.com --password <ADMIN_PASSWORD> --real
 *
 * Thoát với mã 1 nếu có lỗi không mong đợi (ack lỗi lạ, mất kết nối, trận không kết thúc đúng hạn).
 */
import type { AddressInfo } from 'node:net';
import { pathToFileURL } from 'node:url';
import { io as connect, type Socket } from 'socket.io-client';
import {
  TEAM_IDS,
  type ClientToServerEvents,
  type GameView,
  type Phase,
  type PublicQuestionView,
  type ServerToClientEvents,
  type TeamPassView,
  type TeamQuestionView,
  type TeamVoteView,
} from '@cnxh/shared';

type Client = Socket<ServerToClientEvents, ClientToServerEvents>;
type Ack = { ok: boolean; error?: string; [k: string]: unknown };

export interface SimulationOptions {
  /** Server có sẵn; không có → tự chạy server trong tiến trình. */
  url?: string;
  password?: string;
  bots?: number;
  turns?: number;
  bombs?: number;
  /** Dùng thời lượng thật (mặc định của server) thay vì rút ngắn — chỉ áp dụng khi tự chạy server. */
  real?: boolean;
  /** Giới hạn thời gian cả trận (ms). */
  timeoutMs?: number;
  log?: (line: string) => void;
  /** Gọi mỗi khi pha đổi (dùng cho chụp màn hình). */
  onPhase?: (game: GameView, code: string) => void | Promise<void>;
  /** Mã phòng có sẵn (không tạo phòng mới). */
  roomCode?: string;
}

export interface SimulationResult {
  ok: boolean;
  code: string;
  durationMs: number;
  phases: Partial<Record<Phase, number>>;
  turns: number;
  explosions: number;
  acks: number;
  ackErrors: Record<string, number>;
  unexpectedErrors: string[];
  disconnects: number;
  maxAckMs: number;
  avgAckMs: number;
  messagesReceived: number;
  standings: { teamId: number; score: number; rank: number }[];
}

/** Thời lượng rút ngắn cho giả lập nhanh (ms). */
export const FAST_DURATIONS = {
  select: 3000,
  board: 4000,
  boardReveal: 800,
  reveal: 800,
  bomb: 3000,
  bombReveal: 600,
  bombPass: 2500,
  bombExplode: 800,
  fuseMin: 5000,
  fuseMax: 9000,
};

/** Lỗi có thể xảy ra hợp lệ do tranh chấp thời gian (phiếu tới lúc vòng vừa đóng...). */
const EXPECTED_ERRORS = new Set(['CLOSED', 'LOCKED', 'NOT_ENOUGH_VOTES', 'NOT_IN_ROUND', 'NO_QUESTION', 'NOT_CAPTAIN', 'PAUSED']);

const rand = (min: number, max: number) => min + Math.random() * (max - min);
const pick = <T>(xs: readonly T[]): T => xs[Math.floor(Math.random() * xs.length)]!;

export async function runSimulation(opts: SimulationOptions = {}): Promise<SimulationResult> {
  const log = opts.log ?? ((l: string) => console.log(l));
  const botCount = opts.bots ?? 63;
  const started = Date.now();
  let url = opts.url;
  let password = opts.password ?? process.env.ADMIN_PASSWORD ?? 'sim';
  let closeServer: (() => Promise<void>) | null = null;

  if (!url) {
    const { createAppServer } = await import('../server/src/app');
    const server = createAppServer({ adminPassword: password, durations: opts.real ? {} : FAST_DURATIONS, stateFile: null });
    await new Promise<void>((resolve) => server.httpServer.listen(0, resolve));
    url = `http://localhost:${(server.httpServer.address() as AddressInfo).port}`;
    closeServer = () => new Promise<void>((resolve) => server.io.close(() => resolve()));
    log(`[sim] Server trong tiến trình tại ${url} (${opts.real ? 'thời lượng thật' : 'thời lượng rút ngắn'})`);
  }

  const sockets: Client[] = [];
  const ackErrors: Record<string, number> = {};
  const unexpected: string[] = [];
  const ackTimes: number[] = [];
  const phases: Partial<Record<Phase, number>> = {};
  let disconnects = 0;
  let messages = 0;
  let finished = false;

  const client = (): Client => {
    const s: Client = connect(url!, { transports: ['websocket'], forceNew: true, reconnection: true });
    s.onAny(() => messages++);
    s.on('disconnect', (reason) => {
      if (!finished && reason !== 'io client disconnect') {
        disconnects++;
        unexpected.push(`mất kết nối: ${reason}`);
      }
    });
    sockets.push(s);
    return s;
  };
  const call = (s: Client, event: string, ...args: unknown[]) =>
    new Promise<Ack>((resolve) => {
      const t0 = Date.now();
      (s as unknown as Socket).timeout(10_000).emit(event, ...args, (err: Error | null, res: Ack) => {
        ackTimes.push(Date.now() - t0);
        if (err) {
          unexpected.push(`${event}: không có phản hồi sau 10 s`);
          return resolve({ ok: false, error: 'TIMEOUT' });
        }
        if (!res.ok) {
          ackErrors[res.error ?? '?'] = (ackErrors[res.error ?? '?'] ?? 0) + 1;
          if (!EXPECTED_ERRORS.has(res.error ?? '')) unexpected.push(`${event}: ${res.error}`);
        }
        resolve(res);
      });
    });

  // ─── Admin ────────────────────────────────────────────────────────────────
  const admin = client();
  await new Promise<void>((resolve) => admin.on('connect', () => resolve()));
  const login = await call(admin, 'admin:login', { password });
  if (!login.ok) throw new Error('Sai mật khẩu admin (--password hoặc ADMIN_PASSWORD).');
  let code = opts.roomCode;
  if (code) await call(admin, 'admin:watch', { roomCode: code });
  else code = String((await call(admin, 'admin:createRoom'))['code']);
  log(`[sim] Phòng ${code}`);

  let lastGame: GameView | null = null;
  const done = new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Trận không kết thúc trong thời gian cho phép')), opts.timeoutMs ?? 15 * 60_000);
    timer.unref();
    let lastPhase: Phase | null = null;
    admin.on('game:state', (g) => {
      lastGame = g;
      if (g.phase !== lastPhase) {
        lastPhase = g.phase;
        phases[g.phase] = (phases[g.phase] ?? 0) + 1;
        if (g.phase === 'BOARD_SELECT') log(`[sim] Lượt ${g.board?.turn}/${g.board?.totalTurns}`);
        if (g.phase === 'BOMB_EXPLODE') log(`[sim] 💥 ${JSON.stringify(g.bomb?.explosions.at(-1))}`);
        void opts.onPhase?.(g, code!);
        if (g.phase === 'BOMB_INTRO') void call(admin, 'admin:startBomb', { totalBombs: opts.bombs ?? 3 });
        if (g.phase === 'SUMMARY') {
          clearTimeout(timer);
          resolve();
        }
      }
    });
  });

  // ─── Bot ──────────────────────────────────────────────────────────────────
  const perTeam = Math.ceil(botCount / TEAM_IDS.length);
  const bots: Bot[] = [];
  for (let i = 0; i < botCount; i++) {
    const teamId = TEAM_IDS[i % TEAM_IDS.length]!;
    bots.push(new Bot(client(), `Bot ${teamId}-${Math.floor(i / TEAM_IDS.length) + 1}`, teamId, call));
  }
  await Promise.all(bots.map((b) => b.ready));
  // Vào lần lượt theo từng đợt nhỏ như sinh viên quét QR.
  for (let i = 0; i < bots.length; i += 9) await Promise.all(bots.slice(i, i + 9).map((b) => b.join(code!)));
  log(`[sim] ${bots.length} bot đã vào phòng (${perTeam} người/nhóm)`);

  await call(admin, 'admin:startBoard', { totalTurns: opts.turns ?? 14 });
  let error: Error | null = null;
  try {
    await done;
  } catch (err) {
    error = err as Error;
    unexpected.push(error.message);
  }
  finished = true;
  const game = lastGame as GameView | null;
  const standings = (game?.board?.standings ?? []).map((s) => ({ teamId: s.teamId, score: s.score, rank: s.rank }));
  sockets.forEach((s) => s.disconnect());
  await closeServer?.();

  const result: SimulationResult = {
    ok: unexpected.length === 0 && game?.phase === 'SUMMARY',
    code: code!,
    durationMs: Date.now() - started,
    phases,
    turns: game?.board?.turn ?? 0,
    explosions: game?.bomb?.explosions.length ?? 0,
    acks: ackTimes.length,
    ackErrors,
    unexpectedErrors: unexpected.slice(0, 20),
    disconnects,
    maxAckMs: Math.max(0, ...ackTimes),
    avgAckMs: ackTimes.length ? Math.round(ackTimes.reduce((a, b) => a + b, 0) / ackTimes.length) : 0,
    messagesReceived: messages,
    standings,
  };
  return result;
}

/** Một sinh viên giả lập. */
class Bot {
  playerId = '';
  readonly ready: Promise<void>;
  private question: PublicQuestionView | null = null;
  private game: GameView | null = null;
  /** Vòng đã bỏ phiếu / đã hẹn CHỐT. */
  private voted = new Set<number>();
  private lockScheduled = new Set<number>();

  constructor(
    private readonly socket: Client,
    private readonly name: string,
    private readonly teamId: number,
    private readonly call: (s: Client, event: string, ...args: unknown[]) => Promise<Ack>,
  ) {
    this.ready = new Promise((resolve) => socket.on('connect', () => resolve()));
    socket.on('question:state', (q) => (this.question = q));
    socket.on('game:state', (g) => (this.game = g));
    socket.on('select:team', (v) => v && this.onRound(v, v.validTargets));
    socket.on('question:team', (v) => v && this.onQuestion(v));
    socket.on('pass:team', (v: TeamPassView | null) => v && this.onRound(v, v.validTargets));
    // Vào lại sau khi mất kết nối (giữ playerId).
    socket.on('connect', () => {
      if (this.playerId && this.roomCode) void this.call(socket, 'player:join', { roomCode: this.roomCode, playerId: this.playerId });
    });
  }

  private roomCode = '';

  async join(code: string): Promise<void> {
    this.roomCode = code;
    const res = await this.call(this.socket, 'player:join', { roomCode: code, name: this.name, teamId: this.teamId });
    if (res.ok) this.playerId = String(res['playerId']);
  }

  private onQuestion(v: TeamQuestionView): void {
    const q = this.question;
    const count = q && q.roundId === v.roundId ? q.options.length : 0;
    if (count === 0) return;
    this.onRound(v, Array.from({ length: count }, (_, i) => i));
  }

  /** Thời lượng còn lại của vòng (ước lượng theo giờ máy, đủ cho bot). */
  private remainingMs(): number {
    const ends = this.question?.status === 'open' ? this.question.endsAt : this.game?.phaseEndsAt;
    return ends ? Math.max(500, ends - Date.now()) : 3000;
  }

  private onRound(v: TeamVoteView, options: readonly number[]): void {
    if (v.locked || options.length === 0) return;
    if (!this.voted.has(v.roundId)) {
      this.voted.add(v.roundId);
      // ~10% bot "ngủ gật" không bỏ phiếu.
      if (Math.random() > 0.1) {
        const delay = rand(0.05, 0.55) * this.remainingMs();
        setTimeout(() => void this.call(this.socket, 'player:vote', { roundId: v.roundId, option: pick(options) }), delay);
      }
    }
    if (v.captainId === this.playerId && v.canLock && !this.lockScheduled.has(v.roundId)) {
      this.lockScheduled.add(v.roundId);
      // ~15% đội trưởng không chốt → server tự chốt khi hết giờ.
      if (Math.random() > 0.15) {
        const delay = rand(0, 0.3) * this.remainingMs();
        setTimeout(() => {
          void this.call(this.socket, 'player:lock', { roundId: v.roundId }).then((res) => {
            if (!res.ok && res.error === 'NOT_ENOUGH_VOTES') this.lockScheduled.delete(v.roundId);
          });
        }, delay);
      }
    }
  }
}

// ─── CLI ─────────────────────────────────────────────────────────────────────

function parseArgs(argv: string[]): SimulationOptions {
  const opts: SimulationOptions = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === '--url') opts.url = next();
    else if (a === '--password') opts.password = next();
    else if (a === '--bots') opts.bots = Number(next());
    else if (a === '--turns') opts.turns = Number(next());
    else if (a === '--bombs') opts.bombs = Number(next());
    else if (a === '--room') opts.roomCode = next();
    else if (a === '--real') opts.real = true;
    else if (a === '--help' || a === '-h') {
      console.log('npm run simulate -- [--url URL --password PW] [--bots 63] [--turns 14] [--bombs 3] [--room XXXX] [--real]');
      process.exit(0);
    }
  }
  return opts;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  runSimulation(parseArgs(process.argv.slice(2)))
    .then((r) => {
      console.log('\n[sim] Kết quả');
      console.log(`  Phòng ${r.code}, ${(r.durationMs / 1000).toFixed(1)} s, ${r.turns} lượt Bàn Cờ, ${r.explosions} vụ nổ`);
      console.log(`  Pha: ${JSON.stringify(r.phases)}`);
      console.log(`  Ack: ${r.acks} (trung bình ${r.avgAckMs} ms, tối đa ${r.maxAckMs} ms); lỗi hợp lệ do tranh chấp: ${JSON.stringify(r.ackErrors)}`);
      console.log(`  Tin nhận được: ${r.messagesReceived}; mất kết nối: ${r.disconnects}`);
      console.log(`  Xếp hạng: ${r.standings.filter((s) => s.score > 0 || s.rank <= 3).map((s) => `#${s.rank} N${s.teamId}=${s.score}`).join(', ')}`);
      if (!r.ok) {
        console.error(`\n[sim] THẤT BẠI:\n- ${r.unexpectedErrors.join('\n- ')}`);
        process.exit(1);
      }
      console.log('\n[sim] OK — trận chạy trọn vẹn, không lỗi.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('[sim] Lỗi:', err);
      process.exit(1);
    });
}
