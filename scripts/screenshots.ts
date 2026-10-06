/**
 * Chụp lại ảnh minh họa của README (docs/images/*.webp) từ app thật — gọi mỗi khi giao diện đổi.
 *
 *   npm run screenshots                  # build client, chạy server trong tiến trình, ghi đè ảnh trong docs/images
 *   npm run screenshots -- --out /tmp/x  # ghi ra thư mục khác để xem trước
 *   npm run screenshots -- --no-build    # dùng client/dist có sẵn
 *   npm run screenshots -- --chrome /usr/bin/chromium
 *
 * Cần Google Chrome hoặc Chromium (chạy headless, điều khiển qua DevTools Protocol bằng WebSocket có sẵn của Node ≥ 22).
 *
 * Kịch bản cố định để khớp chú thích trong README: 49 sinh viên (7 nhóm × 7). Nhóm trưởng đặt tên là số nhóm
 * (GAME_SPEC 2.1) và vào thứ ba trong nhóm — vẫn tự làm đội trưởng; nhóm trưởng "5" bấm nhầm Nhóm 6 (ảnh /admin ở phòng
 * chờ có thanh nhắc "vào nhầm nhóm"), người dẫn chuyển về. Điện thoại trong ảnh là của nhóm trưởng Nhóm 3 (tên "3").
 * Sau màn luật, cả lớp chơi thử (ảnh lượt thử 1), người dẫn dừng chơi thử rồi bắt đầu trận thật.
 * Lượt 3: Nhóm 3 chiếm ô Hiến pháp (Nhóm 4 cùng tranh nhưng chốt chậm hơn), lượt 4 Nhóm 3 có
 * Khiên Hiến pháp. Nhóm 3 dẫn đầu nên cầm quả bom đầu, trả lời đúng, chuyền cho Nhóm 5; ngòi cố định 4 giây nên bom nổ
 * ở Nhóm 5. Cuối cùng bật chế độ dự phòng để chụp /admin. Phần ngẫu nhiên còn lại (câu hỏi, vị trí ★ Lòng dân, ô bị nổ)
 * không ảnh hưởng chú thích.
 */
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { io as connect, type Socket } from 'socket.io-client';
import {
  CONSTITUTION_CELL,
  cellAt,
  type CellId,
  type ClientToServerEvents,
  type GameView,
  type PublicQuestionView,
  type Question,
  type ServerToClientEvents,
  type TeamSelectView,
} from '@cnxh/shared';
import { createAppServer } from '../server/src/app';

type Client = Socket<ServerToClientEvents, ClientToServerEvents>;
type Ack = { ok: boolean; error?: string; [k: string]: unknown };

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PASSWORD = 'readme';
/** Địa chỉ in trên QR của ảnh màn chiếu: bản web thật trên Render. */
const PUBLIC_URL = 'https://cnxh-game.onrender.com';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const log = (...a: unknown[]) => console.log('[shots]', ...a);

// ─── Tham số dòng lệnh ───────────────────────────────────────────────────────

function parseArgs(argv: string[]) {
  const opts = { out: path.join(ROOT, 'docs/images'), build: true, chrome: process.env.CHROME_PATH ?? '' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--out') opts.out = path.resolve(argv[++i] ?? '');
    else if (a === '--no-build') opts.build = false;
    else if (a === '--chrome') opts.chrome = argv[++i] ?? '';
    else if (a === '--help' || a === '-h') {
      console.log('npm run screenshots -- [--out DIR] [--no-build] [--chrome PATH]');
      process.exit(0);
    }
  }
  return opts;
}

function findChrome(explicit: string): string {
  const candidates = [
    explicit,
    'google-chrome',
    'google-chrome-stable',
    'chromium',
    'chromium-browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  ].filter(Boolean);
  for (const c of candidates) {
    if (c.includes('/') || c.includes('\\')) {
      if (existsSync(c)) return c;
    } else if (spawnSync('which', [c]).status === 0) return c;
  }
  throw new Error('Không tìm thấy Chrome/Chromium — cài Chrome hoặc truyền --chrome <đường dẫn> (hoặc biến CHROME_PATH).');
}

// ─── Chrome headless qua DevTools Protocol ───────────────────────────────────

interface Device {
  width: number;
  height: number;
  scale: number;
  mobile: boolean;
}

/** Màn chiếu 16:9, laptop người dẫn, điện thoại (ảnh 600 px ngang). */
const HOST: Device = { width: 1600, height: 900, scale: 1, mobile: false };
const ADMIN: Device = { width: 1440, height: 900, scale: 1, mobile: false };
const PHONE: Device = { width: 390, height: 844, scale: 600 / 390, mobile: true };

type CdpMessage = { id?: number; result?: unknown; error?: { message: string } };

class Page {
  private seq = 0;
  private readonly pending = new Map<number, (msg: CdpMessage) => void>();

  private constructor(
    private readonly proc: ChildProcess,
    private readonly ws: WebSocket,
    private readonly profile: string,
    private readonly outDir: string,
  ) {
    ws.addEventListener('message', (e) => {
      const msg = JSON.parse(String(e.data)) as CdpMessage;
      const done = msg.id !== undefined ? this.pending.get(msg.id) : undefined;
      if (done) {
        this.pending.delete(msg.id!);
        done(msg);
      }
    });
  }

  static async open(chrome: string, device: Device, outDir: string): Promise<Page> {
    const profile = mkdtempSync(path.join(tmpdir(), 'cnxh-shots-'));
    const proc = spawn(
      chrome,
      [
        '--headless=new',
        '--remote-debugging-port=0',
        `--user-data-dir=${profile}`,
        '--no-first-run',
        '--no-default-browser-check',
        '--hide-scrollbars',
        '--mute-audio',
        'about:blank',
      ],
      { stdio: 'ignore' },
    );
    try {
      // Chrome tự chọn cổng và ghi ra DevToolsActivePort trong thư mục hồ sơ.
      let port = '';
      for (let i = 0; i < 100 && !port; i++) {
        await sleep(100);
        const file = path.join(profile, 'DevToolsActivePort');
        if (existsSync(file)) port = readFileSync(file, 'utf8').split('\n')[0]!.trim();
      }
      if (!port) throw new Error('Chrome không mở được cổng điều khiển');
      let target: { type: string; webSocketDebuggerUrl: string } | undefined;
      for (let i = 0; i < 50 && !target; i++) {
        const list = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()) as { type: string; webSocketDebuggerUrl: string }[];
        target = list.find((t) => t.type === 'page');
        if (!target) await sleep(100);
      }
      if (!target) throw new Error('Không thấy tab của Chrome');
      const ws = new WebSocket(target.webSocketDebuggerUrl);
      await new Promise((r) => ws.addEventListener('open', r, { once: true }));
      const page = new Page(proc, ws, profile, outDir);
      await page.send('Page.enable');
      await page.send('Runtime.enable');
      await page.send('Emulation.setDeviceMetricsOverride', {
        width: device.width,
        height: device.height,
        deviceScaleFactor: device.scale,
        mobile: device.mobile,
      });
      return page;
    } catch (err) {
      proc.kill('SIGKILL'); // mở hỏng thì không để Chrome chạy ngầm
      throw err;
    }
  }

  send(method: string, params: object = {}): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const id = ++this.seq;
      this.pending.set(id, (msg) => (msg.error ? reject(new Error(`${method}: ${msg.error.message}`)) : resolve(msg.result)));
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async eval<T = unknown>(expression: string): Promise<T> {
    const res = (await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })) as {
      result: { value: T };
      exceptionDetails?: { exception?: { description?: string }; text: string };
    };
    if (res.exceptionDetails) throw new Error(`Lỗi trong trang: ${res.exceptionDetails.exception?.description ?? res.exceptionDetails.text}`);
    return res.result.value;
  }

  /** Mở trang; `storage`/`session` được đặt trước cho origin đó (localStorage, sessionStorage). */
  async goto(url: string, setup: { storage?: Record<string, string>; session?: Record<string, string> } = {}): Promise<void> {
    const entries = [
      ...Object.entries(setup.storage ?? {}).map(([k, v]) => `localStorage.setItem(${JSON.stringify(k)}, ${JSON.stringify(v)})`),
      ...Object.entries(setup.session ?? {}).map(([k, v]) => `sessionStorage.setItem(${JSON.stringify(k)}, ${JSON.stringify(v)})`),
    ];
    if (entries.length) {
      await this.send('Page.navigate', { url: `${new URL(url).origin}/api/health` });
      await sleep(300);
      await this.eval(entries.join(';'));
    }
    await this.send('Page.navigate', { url });
    await sleep(1500);
  }

  async waitFor(selector: string, timeoutMs = 15_000): Promise<void> {
    const t0 = Date.now();
    while (!(await this.eval<boolean>(`!!document.querySelector(${JSON.stringify(selector)})`))) {
      if (Date.now() - t0 > timeoutMs) throw new Error(`Không thấy "${selector}"`);
      await sleep(150);
    }
  }

  /** Bấm chuột thật (sự kiện "trusted" — vd. mở khóa âm thanh trên màn chiếu). */
  async clickAt(x: number, y: number): Promise<void> {
    await this.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
    await this.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
  }

  async press(key: string, code: string, keyCode: number, text?: string): Promise<void> {
    await this.send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: keyCode, text });
    await this.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: keyCode });
  }

  async type(text: string): Promise<void> {
    await this.send('Input.insertText', { text });
  }

  async shot(name: string): Promise<void> {
    const { data } = (await this.send('Page.captureScreenshot', { format: 'webp', quality: 82 })) as { data: string };
    writeFileSync(path.join(this.outDir, `${name}.webp`), Buffer.from(data, 'base64'));
    log('đã chụp', `${name}.webp`);
  }

  async close(): Promise<void> {
    try {
      this.ws.close();
    } catch {
      /* đã đóng */
    }
    // SIGTERM để Chrome tự tắt; có lúc Chrome treo giữa chừng khi tắt và chạy ngầm mãi → quá hạn thì SIGKILL.
    const exited = () => this.proc.exitCode !== null || this.proc.signalCode !== null;
    const waitExit = (ms: number) => (exited() ? Promise.resolve() : Promise.race([new Promise((r) => this.proc.once('exit', r)), sleep(ms)]));
    this.proc.kill();
    await waitExit(3_000);
    if (!exited()) {
      this.proc.kill('SIGKILL');
      await waitExit(2_000);
    }
    try {
      rmSync(this.profile, { recursive: true, force: true, maxRetries: 3 });
    } catch {
      /* thư mục tạm của hệ điều hành — để lại cũng không sao */
    }
  }
}

// ─── Người chơi giả ──────────────────────────────────────────────────────────

/**
 * 7 nhóm × 7 người, theo thứ tự vào. Nhóm trưởng đặt tên là số nhóm (GAME_SPEC 2.1), vào thứ ba — vẫn tự làm đội trưởng.
 * "3" là điện thoại trong ảnh.
 */
const NAMES: string[][] = [
  ['Minh Anh', 'Bảo Ngọc', '1', 'Đức Thịnh', 'Khánh Linh', 'Quốc Bảo', 'Thu Trang'],
  ['Mai Phương', 'Tuấn Kiệt', '2', 'Thanh Hằng', 'Đăng Khoa', 'Phương Thảo', 'Văn Hùng'],
  ['Minh Khôi', 'Lan Chi', '3', 'Hải Đăng', 'Thùy Dung', 'Trung Hiếu', 'Kim Ngân'],
  ['Anh Tuấn', 'Đình Phong', '4', 'Yến Nhi', 'Quang Vinh', 'Bích Ngọc', 'Thế Anh'],
  ['Thành Đạt', 'Diệu Linh', '5', 'Gia Bảo', 'Hữu Phước', 'Ngọc Ánh', 'Công Minh'],
  ['Phúc Lâm', 'Tiến Dũng', '6', 'Kiều Oanh', 'Nhật Minh', 'Tố Uyên', 'Văn Toàn'],
  ['Thu Hà', 'Minh Quân', '7', 'Cẩm Tú', 'Bá Long', 'Vân Anh', 'Quang Huy'],
];
/** Nhóm trưởng bấm nhầm nhóm khi vào phòng: tên → nhóm đã bấm. */
const MISTAPPED: Record<string, number> = { '5': 6 };

interface Bot {
  name: string;
  team: number;
  socket: Client;
  id: string;
}

const call = (s: Client, event: string, ...args: unknown[]) =>
  new Promise<Ack>((resolve) => (s as unknown as Socket).timeout(10_000).emit(event, ...args, (err: Error | null, res: Ack) => resolve(err ? { ok: false, error: 'TIMEOUT' } : res)));

function ready(s: Client): Promise<void> {
  return new Promise((r) => (s.connected ? r() : s.once('connect', () => r())));
}

// ─── Kịch bản ────────────────────────────────────────────────────────────────

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const chrome = findChrome(opts.chrome);
  mkdirSync(opts.out, { recursive: true });
  if (opts.build) {
    log('build client…');
    const r = spawnSync('npm', ['run', 'build', '-w', 'client'], { cwd: ROOT, stdio: 'inherit', shell: process.platform === 'win32' });
    if (r.status !== 0) throw new Error('Build client lỗi');
  }

  // Câu hỏi thật (để "sinh viên" trả lời đúng/sai theo kịch bản).
  const bank = (JSON.parse(readFileSync(path.join(ROOT, 'data/questions.json'), 'utf8')) as { questions: Question[] }).questions;
  const answerIndex = (q: PublicQuestionView) => {
    const b = bank.find((x) => x.prompt === q.prompt);
    return b ? Math.max(0, q.options.indexOf(b.options[b.answerIndex]!)) : 0;
  };

  // Thời lượng thật của trò chơi (đồng hồ trong ảnh giống buổi học); chỉ cố định ngòi 4 s để bom nổ đúng ở Nhóm 5.
  const server = createAppServer({
    serveClient: true,
    adminPassword: PASSWORD,
    stateFile: null,
    publicUrl: PUBLIC_URL,
    durations: { fuseMin: 4_000, fuseMax: 4_000 },
  });
  await new Promise<void>((r) => server.httpServer.listen(0, r));
  const url = `http://localhost:${(server.httpServer.address() as AddressInfo).port}`;
  log('server', url);

  const pages: Page[] = [];
  const sockets: Client[] = [];
  const cleanup = async () => {
    await Promise.all(pages.map((p) => p.close()));
    sockets.forEach((s) => s.disconnect());
    await new Promise<void>((r) => server.io.close(() => r()));
  };

  try {
    // Người dẫn (socket riêng, theo dõi trạng thái công khai).
    const admin: Client = connect(url, { transports: ['websocket'], forceNew: true });
    sockets.push(admin);
    await ready(admin);
    await call(admin, 'admin:login', { password: PASSWORD });
    const code = String((await call(admin, 'admin:createRoom'))['code']);
    let game: GameView | null = null;
    let question: PublicQuestionView | null = null;
    admin.on('game:state', (g) => (game = g));
    admin.on('question:state', (q) => (question = q));
    const g = () => game as GameView | null;
    const q = () => question as PublicQuestionView | null;
    const until = async (pred: () => boolean, label: string, timeoutMs = 60_000) => {
      const t0 = Date.now();
      while (!pred()) {
        if (Date.now() - t0 > timeoutMs) throw new Error(`Hết giờ chờ: ${label}`);
        await sleep(100);
      }
    };

    // Ba "thiết bị": màn chiếu, laptop người dẫn, điện thoại của nhóm trưởng Nhóm 3.
    const open = async (device: Device) => {
      const page = await Page.open(chrome, device, opts.out);
      pages.push(page); // đóng được cả khi thiết bị sau mở hỏng
      return page;
    };
    const host = await open(HOST);
    const adminPage = await open(ADMIN);
    const phone = await open(PHONE);

    // ── Phòng chờ ────────────────────────────────────────────────────────────
    // Nhóm trưởng Nhóm 3 gõ tên "3": nút Nhóm 3 tự được chọn.
    await phone.goto(`${url}/play?room=${code}`);
    await phone.waitFor('.join-form input');
    await phone.eval(`document.querySelector('.join-form input').focus()`);
    await phone.type('3');
    await sleep(300);
    await phone.shot('play-join');

    const bots: Bot[] = [];
    for (const [i, names] of NAMES.entries()) {
      for (const name of names) {
        const s: Client = connect(url, { transports: ['websocket'], forceNew: true });
        sockets.push(s);
        await ready(s);
        const teamId = MISTAPPED[name] ?? i + 1;
        const res = await call(s, 'player:join', { roomCode: code, name, teamId });
        bots.push({ name, team: teamId, socket: s, id: String(res['playerId']) });
      }
    }
    log(`${bots.length} người chơi đã vào phòng ${code}`);
    const team = (t: number) => bots.filter((b) => b.team === t);
    const byName = (name: string) => bots.find((b) => b.name === name)!;
    const captain3 = byName('3'); // điện thoại trong ảnh: nhóm trưởng Nhóm 3

    // Phiếu chọn ô mới nhất của từng nhóm (ô hợp lệ của lượt).
    const selectView = new Map<number, TeamSelectView>();
    for (const t of [1, 2, 3, 4, 5, 6, 7]) team(t)[0]!.socket.on('select:team', (v) => v && selectView.set(t, v));

    await phone.goto(`${url}/play?room=${code}`, { storage: { 'cnxh.player': JSON.stringify({ roomCode: code, playerId: captain3.id }) } });
    await phone.waitFor('.wait-card');
    await phone.shot('play-lobby');

    await adminPage.goto(`${url}/admin`, { session: { 'cnxh.adminPassword': PASSWORD } });
    await adminPage.waitFor('.admin-callout');
    await adminPage.shot('admin-lobby');
    // Người dẫn bấm "Chuyển về Nhóm 5": vào đúng nhóm là tự làm đội trưởng.
    for (const [name, wrong] of Object.entries(MISTAPPED)) {
      const bot = byName(name);
      const teamId = NAMES.findIndex((names) => names.includes(name)) + 1;
      await call(admin, 'admin:movePlayer', { playerId: bot.id, teamId });
      if (wrong !== teamId) bot.team = teamId;
    }

    await host.goto(`${url}/host`);
    await host.waitFor('.host-lobby');
    await host.clickAt(1300, 60); // mở khóa âm thanh: nút âm thanh thu gọn như khi dùng thật
    await sleep(5_600); // gợi ý phím tự ẩn
    await host.shot('host-lobby');
    await host.press('k', 'KeyK', 75, 'k');
    await host.waitFor('.remote-dialog input');
    await host.type(PASSWORD);
    await host.press('Enter', 'Enter', 13, '\r');
    await host.waitFor('.remote-toast');
    await sleep(400);
    await host.shot('host-remote');

    // ── Luật chơi ────────────────────────────────────────────────────────────
    await call(admin, 'admin:showRules');
    await until(() => g()?.phase === 'RULES', 'RULES');
    await sleep(5_600); // hiệu ứng hiện thẻ + ★ rơi + gợi ý phím tự ẩn
    await host.shot('host-rules');
    await phone.waitFor('.play-rules');
    await phone.shot('play-rules');

    // ── Chơi thử (GAME_SPEC 5.3): lượt thử 1, rồi người dẫn dừng chơi thử ──────
    await call(admin, 'admin:startPractice', {});
    await until(() => g()?.phase === 'BOARD_SELECT' && !!g()!.board?.practice, 'chơi thử');
    const practiceRound = g()!.board!.select!.roundId;
    await until(() => [1, 2, 3, 4, 5, 6, 7].every((t) => selectView.get(t)?.roundId === practiceRound), 'phiếu chọn ô (chơi thử)');
    // Năm nhóm đã chốt; Nhóm 3 mới có 3 phiếu (có điện thoại trong ảnh), Nhóm 6 chưa bầu.
    for (const t of [1, 2, 4, 5, 7]) {
      const cell = selectView.get(t)!.validTargets.find((c) => g()!.board!.owners[c] === null)!;
      for (const b of team(t)) await call(b.socket, 'player:vote', { roundId: practiceRound, option: cell });
    }
    const practiceCell = selectView.get(3)!.validTargets.find((c) => g()!.board!.owners[c] === null)!;
    for (const b of team(3).slice(0, 3)) await call(b.socket, 'player:vote', { roundId: practiceRound, option: practiceCell });
    await sleep(1_200);
    await host.shot('host-practice');
    await phone.shot('play-practice');
    await call(admin, 'admin:stopPractice');
    await until(() => g()?.phase === 'RULES', 'quay lại màn luật');

    // ── Bàn Cờ: kịch bản 4 lượt ─────────────────────────────────────────────
    const C = (q: number, r: number) => cellAt(q, r)! as CellId;
    const selectRound = () => g()!.board!.select!.roundId;
    /** `count` thành viên đầu (từ `from`) của nhóm bỏ phiếu cho ô `cell`. */
    const voteCell = async (t: number, cell: CellId, count = 7, from = 0) => {
      for (const b of team(t).slice(from, from + count)) await call(b.socket, 'player:vote', { roundId: selectRound(), option: cell });
    };
    /** Cả nhóm bầu cùng một phương án câu hỏi → nhóm tự chốt đúng lúc phiếu cuối tới. */
    const voteAnswer = async (t: number, correct: boolean, count = 7, from = 0) => {
      const cur = q()!;
      const right = answerIndex(cur);
      const option = correct ? right : (right + 1) % cur.options.length;
      for (const b of team(t).slice(from, from + count)) await call(b.socket, 'player:vote', { roundId: cur.roundId, option });
    };
    const firstValid = (t: number, prefer: CellId[] = []) => {
      const valid = selectView.get(t)?.validTargets ?? [];
      return prefer.find((c) => valid.includes(c)) ?? valid.find((c) => g()!.board!.owners[c] === null) ?? valid[0]!;
    };
    const waitSelect = async (turn: number) => {
      await until(() => g()?.phase === 'BOARD_SELECT' && g()!.board?.turn === turn, `chọn ô lượt ${turn}`);
      await until(() => [1, 2, 3, 4, 5, 6, 7].every((t) => selectView.get(t)?.roundId === selectRound()), `phiếu chọn ô lượt ${turn}`);
    };
    const waitQuestion = () => until(() => g()?.phase === 'BOARD_QUESTION' && q()?.status === 'open', 'câu hỏi');

    await call(admin, 'admin:startBoard', { totalTurns: 4 });

    // Lượt 1–2: mỗi nhóm mở rộng về phía tâm, ai cũng đúng (lượt 2 bốn nhóm lấy được ô Cơ quan).
    const plan: Record<number, [number, number][]> = {
      1: [[0, -2], [0, -1]],
      2: [[2, -2], [1, -1]],
      3: [[2, -1], [1, 0]],
      4: [[1, 1], [0, 1]],
      5: [[-1, 2], [-1, 1]],
      6: [[-2, 1], [-2, 2]],
      7: [[-2, 0], [-1, 0]],
    };
    for (const turn of [1, 2]) {
      await waitSelect(turn);
      for (const t of [1, 2, 3, 4, 5, 6, 7]) await voteCell(t, C(...plan[t]![turn - 1]!));
      await waitQuestion();
      for (const t of [1, 2, 3, 4, 5, 6, 7]) await voteAnswer(t, true);
      await until(() => g()?.phase === 'BOARD_REVEAL', `kết quả lượt ${turn}`);
    }

    // Lượt 3: ★ Lòng dân xuất hiện; Nhóm 3 và Nhóm 4 cùng nhắm ô Hiến pháp.
    await waitSelect(3);
    const star = g()!.board!.newStar;
    await voteCell(1, firstValid(1, [C(1, -2)]));
    await voteCell(2, firstValid(2, [C(2, -3)]));
    await voteCell(4, CONSTITUTION_CELL);
    await voteCell(5, firstValid(5, star !== null ? [star] : []));
    await voteCell(7, firstValid(7, [C(-2, -1)]));
    // Nhóm 3: 4 phiếu cho ô Hiến pháp (có điện thoại trong ảnh), 1 phiếu cho ô khác, đội trưởng chưa chốt.
    await voteCell(3, CONSTITUTION_CELL, 4);
    await voteCell(3, C(2, 0), 1, 4);
    await sleep(2_500); // băng-rôn ★ và hiệu ứng sao rơi
    await host.shot('host-select');
    await phone.shot('play-select');
    await voteCell(6, firstValid(6, star !== null ? [star] : []));
    await call(captain3.socket, 'player:lock', { roundId: selectRound() });

    await waitQuestion();
    // Nhóm 3: 4 người đã bầu (đủ quá nửa) — điện thoại đội trưởng thấy nút CHỐT.
    await voteAnswer(3, true, 3);
    await voteAnswer(3, false, 1, 3);
    await sleep(500);
    await phone.shot('play-question');
    await call(captain3.socket, 'player:lock', { roundId: q()!.roundId });
    await sleep(500);
    await phone.shot('play-question-locked');
    await voteAnswer(1, true);
    await voteAnswer(7, true);
    await sleep(800);
    await voteAnswer(4, true); // đúng nhưng chốt sau Nhóm 3
    await sleep(600);
    await host.shot('host-question');
    await voteAnswer(2, false);
    await voteAnswer(5, true);
    await voteAnswer(6, false);
    await until(() => g()?.phase === 'BOARD_REVEAL', 'kết quả lượt 3');
    await sleep(1_200);
    await host.shot('host-reveal');
    await phone.shot('play-reveal');
    await adminPage.shot('admin-game');

    // Lượt 4: Nhóm 3 có Khiên Hiến pháp; lượt cuối.
    await waitSelect(4);
    await sleep(800);
    await phone.shot('play-shield');
    for (const t of [1, 2, 3, 4, 5, 6, 7]) await voteCell(t, firstValid(t, t === 3 ? [C(2, 0)] : []));
    await waitQuestion();
    for (const t of [1, 2, 3, 4, 5, 6, 7]) await voteAnswer(t, t === 3 || t === 5);

    // ── Quả Bom ──────────────────────────────────────────────────────────────
    await until(() => g()?.phase === 'BOMB_INTRO', 'giới thiệu Quả Bom', 30_000);
    if (g()!.bomb!.holder !== 3) throw new Error(`Kịch bản cần Nhóm 3 cầm bom đầu (đang là Nhóm ${g()!.bomb!.holder})`);
    await sleep(1_500);
    await host.shot('host-bomb-intro');
    await call(admin, 'admin:startBomb', { totalBombs: 1 });
    await until(() => g()?.phase === 'BOMB_QUESTION' && q()?.status === 'open', 'câu bom');
    await sleep(800);
    await host.shot('host-bomb-question');
    await phone.shot('play-bomb-question');
    await voteAnswer(3, true); // ngòi đã cháy khoảng 1,5 s / 4 s
    await until(() => g()?.phase === 'BOMB_PASS', 'chuyền bom');
    const passRound = () => g()!.bomb!.pass!.roundId;
    for (const b of team(3).slice(0, 4)) await call(b.socket, 'player:vote', { roundId: passRound(), option: 5 });
    await sleep(800);
    await host.shot('host-bomb-pass');
    await phone.shot('play-bomb-pass');
    await call(captain3.socket, 'player:lock', { roundId: passRound() });
    // Nhóm 5 không kịp trả lời: ngòi còn khoảng 2,5 s → nổ ở Nhóm 5.
    await until(() => g()?.phase === 'BOMB_EXPLODE', 'bom nổ', 20_000);
    await sleep(1_200);
    await host.shot('host-explode');
    await phone.shot('play-explode');

    // ── Tổng kết ─────────────────────────────────────────────────────────────
    await until(() => g()?.phase === 'SUMMARY', 'tổng kết', 20_000);
    await sleep(3_000);
    await host.shot('host-summary');
    await phone.shot('play-summary');
    await call(admin, 'admin:setSummaryView', { view: 'lessons' });
    await sleep(4_500);
    await host.shot('host-lessons');

    // ── Chế độ dự phòng trên /admin ─────────────────────────────────────────
    await call(admin, 'admin:setFallback', { on: true });
    await call(admin, 'admin:startBoard', { totalTurns: 4 });
    await until(() => g()?.phase === 'BOARD_SELECT', 'chọn ô (dự phòng)');
    await call(admin, 'admin:fallbackSelect', { targets: {} });
    await until(() => g()?.phase === 'BOARD_QUESTION', 'câu hỏi (dự phòng)');
    await adminPage.waitFor('.fallback__cards');
    // Người dẫn bấm thẻ các nhóm giơ, theo thứ tự nhanh → chậm.
    for (const t of [3, 5, 1, 6, 2, 7, 4]) {
      await adminPage.eval(
        `[...document.querySelectorAll('.fallback__row')][${t - 1}].querySelectorAll('.fallback__cards button')[${t === 2 ? 1 : 2}].click()`,
      );
      await sleep(150);
    }
    await adminPage.eval('window.scrollTo(0, 0)');
    await sleep(400);
    await adminPage.shot('admin-fallback');
    await call(admin, 'admin:setFallback', { on: false });

    log(`xong — ảnh nằm ở ${path.relative(ROOT, opts.out) || opts.out}`);
  } finally {
    await cleanup();
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[shots] Lỗi:', err instanceof Error ? err.message : err);
    process.exit(1);
  });
