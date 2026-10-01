import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io as connect, type Socket } from 'socket.io-client';
import type {
  ClientToServerEvents,
  PublicQuestionView,
  Question,
  ServerToClientEvents,
  TeamQuestionView,
} from '@cnxh/shared';
import { createAppServer } from './app';

type Client = Socket<ServerToClientEvents, ClientToServerEvents>;
type Ack = { ok: boolean; error?: string; [k: string]: unknown };

const SECRET = 'GIAI_THICH_BI_MAT';
const BANK: Question[] = [
  {
    id: 'q1', pool: 'board', topic: 't', type: 'mcq', prompt: 'Câu thử?',
    options: ['Đáp án đúng', 'Sai 1', 'Sai 2', 'Sai 3'], answerIndex: 0, explanation: SECRET,
  },
  {
    id: 'q2', pool: 'board', topic: 't', type: 'mcq', prompt: 'Câu thử 2?',
    options: ['Đúng 2', 'X', 'Y', 'Z'], answerIndex: 0, explanation: SECRET,
  },
];

/** Payload có lộ đáp án đúng / giải thích / lựa chọn của nhóm không? */
function leaks(payload: unknown): boolean {
  const json = JSON.stringify(payload) ?? '';
  return /"answerIndex"|"explanation"|"correct"|"reveal":\{/.test(json) || json.includes(SECRET);
}

describe('câu hỏi qua Socket.IO', () => {
  const { httpServer, io } = createAppServer({
    adminPassword: 'pw',
    questions: BANK,
    durations: { board: 1500, reveal: 150 },
  });
  let url = '';
  const sockets: Client[] = [];

  const client = (): Client => {
    const s: Client = connect(url, { transports: ['websocket'], forceNew: true });
    sockets.push(s);
    return s;
  };
  const call = (s: Client, event: string, ...args: unknown[]) =>
    new Promise<Ack>((resolve) => (s as unknown as Socket).emit(event, ...args, resolve));
  const waitFor = <T>(s: Client, event: 'question:state' | 'question:team', pred: (v: T) => boolean) =>
    new Promise<T>((resolve) => {
      const on = (v: T) => {
        if (pred(v)) {
          (s as unknown as Socket).off(event, on);
          resolve(v);
        }
      };
      (s as unknown as Socket).on(event, on);
    });

  /** Ghi mọi sự kiện một socket nhận được. */
  const record = (s: Client) => {
    const log: { event: string; payload: unknown }[] = [];
    s.onAny((event, payload) => log.push({ event, payload }));
    return log;
  };

  /** `extra`: thêm A3 (nhóm 1) và B2 (nhóm 2) — để nhóm chưa tự chốt khi chỉ một phần bỏ phiếu. */
  async function setup(extra = false) {
    const admin = client();
    await call(admin, 'admin:login', { password: 'pw' });
    const { code } = (await call(admin, 'admin:createRoom')) as unknown as { code: string };
    const host = client();
    await call(host, 'host:watch', { roomCode: code });
    const [a1, a2, b1] = [client(), client(), client()];
    await call(a1, 'player:join', { roomCode: code, name: 'A1', teamId: 1 });
    await call(a2, 'player:join', { roomCode: code, name: 'A2', teamId: 1 });
    await call(b1, 'player:join', { roomCode: code, name: 'B1', teamId: 2 });
    const [a3, b2] = [client(), client()];
    if (extra) {
      await call(a3, 'player:join', { roomCode: code, name: 'A3', teamId: 1 });
      await call(b2, 'player:join', { roomCode: code, name: 'B2', teamId: 2 });
    }
    return { admin, host, a1, a2, b1, a3, b2 };
  }

  beforeAll(async () => {
    await new Promise<void>((resolve) => httpServer.listen(0, resolve));
    url = `http://localhost:${(httpServer.address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    sockets.forEach((s) => s.disconnect());
    await new Promise<void>((resolve) => io.close(() => resolve()));
  });

  it('không payload nào (host, admin, người chơi, ack) chứa đáp án đúng khi câu còn mở', async () => {
    const { admin, host, a1, a2, b1, a3, b2 } = await setup(true);
    const all = [admin, host, a1, a2, b1, a3, b2];
    const logs = all.map(record);
    const acks: Ack[] = [];

    const closedAtHost = waitFor<PublicQuestionView | null>(host, 'question:state', (v) => v?.status === 'closed');
    const clearedAtHost = closedAtHost.then(() =>
      waitFor<PublicQuestionView | null>(host, 'question:state', (v) => v === null),
    );
    const start = await call(admin, 'admin:startQuestion', { pool: 'board' });
    acks.push(start);
    const roundId = start.roundId as number;

    const q = await waitFor<PublicQuestionView | null>(a1, 'question:state', (v) => v?.roundId === roundId);
    const original = BANK.find((x) => x.prompt === q!.prompt)!;
    const correct = q!.options.indexOf(original.options[original.answerIndex]!);
    expect(correct).toBeGreaterThanOrEqual(0);
    acks.push(await call(a1, 'player:vote', { roundId, option: correct }));
    acks.push(await call(a2, 'player:vote', { roundId, option: (correct + 1) % 4 }));
    acks.push(await call(a2, 'player:vote', { roundId, option: correct }));
    acks.push(await call(a1, 'player:lock', { roundId }));
    acks.push(await call(b1, 'player:vote', { roundId, option: (correct + 2) % 4 }));

    // Trước khi nhóm cuối chốt: kiểm tra toàn bộ những gì đã nhận.
    const snapshot = logs.map((l) => [...l]);
    for (const log of snapshot) for (const { payload } of log) expect(leaks(payload)).toBe(false);
    for (const ack of acks) expect(leaks(ack)).toBe(false);

    // Nhóm 2 không bao giờ thấy phiếu của nhóm 1 và ngược lại.
    const b1Teams = logs[4]!.filter((e) => e.event === 'question:team').map((e) => e.payload as TeamQuestionView | null);
    expect(b1Teams.every((v) => v === null || v.teamId === 2)).toBe(true);
    const a1Teams = logs[2]!.filter((e) => e.event === 'question:team').map((e) => e.payload as TeamQuestionView | null);
    expect(a1Teams.every((v) => v === null || v.teamId === 1)).toBe(true);

    // Thành viên online cuối cùng của nhóm 2 bỏ phiếu → nhóm tự chốt → mọi nhóm đã chốt → câu đóng sớm, lúc này mới có đáp án.
    await call(b2, 'player:vote', { roundId, option: (correct + 2) % 4 });
    const closed = await closedAtHost;
    expect(closed!.reveal!.answerIndex).toBe(correct);
    expect(closed!.reveal!.explanation).toBe(SECRET);
    expect(closed!.reveal!.results.map((r) => [r.teamId, r.correct, r.lockedBy])).toEqual([
      [1, true, 'captain'],
      [2, false, 'auto'],
      // nhóm rỗng tự chốt khi đóng, không có lựa chọn
      ...[3, 4, 5, 6, 7].map((t) => [t, false, 'timeout']),
    ]);
    expect(closed!.reveal!.results[0]!.lockedAfterMs).toBeLessThanOrEqual(closed!.reveal!.results[1]!.lockedAfterMs);

    // Mọi payload trước sự kiện "closed" đầu tiên của từng socket đều sạch.
    for (const log of logs) {
      const idx = log.findIndex(
        (e) => e.event === 'question:state' && (e.payload as PublicQuestionView | null)?.status === 'closed',
      );
      const before = idx === -1 ? log : log.slice(0, idx);
      for (const { payload } of before) expect(leaks(payload)).toBe(false);
    }

    // Hết thời gian hiện đáp án → không còn câu hỏi.
    await clearedAtHost;
  });

  it('CHỐT: chỉ đội trưởng, chỉ khi quá nửa online đã bầu; hết giờ server tự chốt', async () => {
    const { admin, host, a1, a2 } = await setup();
    const closedP = waitFor<PublicQuestionView | null>(host, 'question:state', (v) => v?.status === 'closed');
    const teamViewP = waitFor<TeamQuestionView | null>(a1, 'question:team', (v) => v?.votedOnlineCount === 1);
    const { roundId } = await call(admin, 'admin:startQuestion', { pool: 'board' });
    expect(await call(admin, 'admin:startQuestion', { pool: 'board' })).toEqual({ ok: false, error: 'QUESTION_ACTIVE' });

    await call(a2, 'player:vote', { roundId, option: 1 });
    expect(await call(a2, 'player:lock', { roundId })).toEqual({ ok: false, error: 'NOT_CAPTAIN' });
    expect(await call(a1, 'player:lock', { roundId })).toEqual({ ok: false, error: 'NOT_ENOUGH_VOTES' });
    expect(await call(a1, 'player:vote', { roundId: 999, option: 1 })).toEqual({ ok: false, error: 'NO_QUESTION' });

    // Phiếu nhóm 1 cập nhật cho đội trưởng: 1/2 chưa quá nửa → nút CHỐT tắt.
    const teamView = await teamViewP;
    expect(teamView!.canLock).toBe(false);

    const closed = await closedP;
    const team1 = closed!.reveal!.results.find((r) => r.teamId === 1)!;
    expect(team1).toMatchObject({ choice: 1, lockedBy: 'timeout', lockedAfterMs: 1500 });
    expect(closed!.reveal!.results.find((r) => r.teamId === 2)!.choice).toBeNull();
  });

  it('tự chốt khi mọi thành viên online đã bỏ phiếu; mọi nhóm tự chốt → câu đóng sớm', async () => {
    const { admin, host, a1, a2, b1 } = await setup();
    const closedP = waitFor<PublicQuestionView | null>(host, 'question:state', (v) => v?.status === 'closed');
    const lockedViewP = waitFor<TeamQuestionView | null>(a2, 'question:team', (v) => v?.locked === true);
    const startedAt = Date.now();
    const { roundId } = await call(admin, 'admin:startQuestion', { pool: 'board' });

    await call(a1, 'player:vote', { roundId, option: 2 });
    await call(a2, 'player:vote', { roundId, option: 2 });
    // Cả nhóm 1 đã bầu → tự chốt; thành viên thấy nhóm đã chốt, không đổi phiếu được nữa.
    expect(await lockedViewP).toMatchObject({ locked: true, choice: 2 });
    expect(await call(a2, 'player:vote', { roundId, option: 3 })).toEqual({ ok: false, error: 'LOCKED' });
    expect(await call(a1, 'player:lock', { roundId })).toEqual({ ok: false, error: 'LOCKED' });

    await call(b1, 'player:vote', { roundId, option: 1 });
    const closed = await closedP;
    expect(Date.now() - startedAt).toBeLessThan(1500); // không chờ hết giờ
    const byTeam = Object.fromEntries(closed!.reveal!.results.map((r) => [r.teamId, r]));
    expect(byTeam[1]).toMatchObject({ choice: 2, lockedBy: 'auto' });
    expect(byTeam[2]).toMatchObject({ choice: 1, lockedBy: 'auto' });
  });

  it('admin bỏ qua câu → hủy, không công bố đáp án', async () => {
    const { admin, host } = await setup();
    const log = record(host);
    await call(admin, 'admin:startQuestion', { pool: 'board' });
    const cleared = waitFor<PublicQuestionView | null>(host, 'question:state', (v) => v === null);
    expect(await call(admin, 'admin:skipQuestion')).toEqual({ ok: true });
    await cleared;
    await new Promise((r) => setTimeout(r, 1700)); // quá hạn câu hỏi: timer đã bị hủy
    for (const { payload } of log) expect(leaks(payload)).toBe(false);
    expect(await call(admin, 'admin:skipQuestion')).toEqual({ ok: false, error: 'NO_QUESTION' });
  });
});
