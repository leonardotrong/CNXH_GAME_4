import { mkdtempSync, rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { io as connect, type Socket } from 'socket.io-client';
import {
  OUTER_RING,
  type ClientToServerEvents,
  type GameView,
  type LogEntry,
  type PublicQuestionView,
  type Question,
  type ServerToClientEvents,
} from '@cnxh/shared';
import { createAppServer, type AppServer } from './app';
import { readSnapshot } from './persistence';

type Client = Socket<ServerToClientEvents, ClientToServerEvents>;
type Ack = { ok: boolean; error?: string; [k: string]: unknown };

const BANK: Question[] = [
  ...[1, 2, 3].map(
    (i): Question => ({ id: `b${i}`, pool: 'board', topic: 't', type: 'mcq', prompt: `Câu ${i}?`, options: ['Đúng', 'X', 'Y', 'Z'], answerIndex: 0, explanation: 'g' }),
  ),
];
const DURATIONS = { select: 1500, board: 1500, boardReveal: 300, reveal: 300 };

const dir = mkdtempSync(path.join(tmpdir(), 'cnxh-state-'));
const stateFile = path.join(dir, 'match.json');
const sockets: Client[] = [];
const servers: AppServer[] = [];

async function start(): Promise<{ server: AppServer; url: string }> {
  const server = createAppServer({ adminPassword: 'pw', questions: BANK, durations: DURATIONS, stateFile });
  servers.push(server);
  await new Promise<void>((resolve) => server.httpServer.listen(0, resolve));
  return { server, url: `http://localhost:${(server.httpServer.address() as AddressInfo).port}` };
}
async function stop(server: AppServer) {
  server.flush();
  await new Promise<void>((resolve) => server.io.close(() => resolve()));
}
const client = (url: string): Client => {
  const s: Client = connect(url, { transports: ['websocket'], forceNew: true });
  sockets.push(s);
  return s;
};
const call = (s: Client, event: string, ...args: unknown[]) =>
  new Promise<Ack>((resolve) => (s as unknown as Socket).emit(event, ...args, (res: Ack) => resolve(res)));
const waitFor = <T>(s: Client, event: keyof ServerToClientEvents, pred: (v: T) => boolean) =>
  new Promise<T>((resolve) => {
    const on = (v: T) => {
      if (pred(v)) {
        (s as unknown as Socket).off(event, on);
        resolve(v);
      }
    };
    (s as unknown as Socket).on(event, on);
  });
const answerOf = (q: PublicQuestionView) => q.options.indexOf('Đúng');

afterAll(async () => {
  sockets.forEach((s) => s.disconnect());
  for (const s of servers) await new Promise<void>((resolve) => s.io.close(() => resolve()));
  rmSync(dir, { recursive: true, force: true });
});

describe('Lưu trạng thái + khôi phục qua Socket.IO', () => {
  it('tắt server giữa câu hỏi rồi bật lại → đúng pha, đang tạm dừng, người chơi vào lại giữ nhóm, tiếp tục chơi được', async () => {
    const a = await start();
    const admin = client(a.url);
    await call(admin, 'admin:login', { password: 'pw' });
    const { code } = (await call(admin, 'admin:createRoom')) as unknown as { code: string };
    const p1 = client(a.url);
    const p2 = client(a.url);
    const j1 = await call(p1, 'player:join', { roomCode: code, name: 'An', teamId: 1 });
    await call(p2, 'player:join', { roomCode: code, name: 'Bình', teamId: 2 });
    const qOpen = waitFor<PublicQuestionView | null>(p1, 'question:state', (v) => v?.status === 'open');
    await call(admin, 'admin:startBoard', { totalTurns: 2 });
    const q = (await qOpen)!; // SELECT hết giờ → câu hỏi
    await call(p1, 'player:vote', { roundId: q.roundId, option: answerOf(q) });
    await call(p1, 'player:lock', { roundId: q.roundId });
    await stop(a.server);
    sockets.forEach((s) => s.disconnect());

    const saved = readSnapshot(stateFile);
    expect(saved?.phase).toBe('BOARD_QUESTION');

    const b = await start();
    const admin2 = client(b.url);
    await call(admin2, 'admin:login', { password: 'pw' });
    const logP = waitFor<LogEntry[]>(admin2, 'admin:log', (v) => v.length > 0);
    const gameP = waitFor<GameView>(admin2, 'game:state', () => true);
    expect(await call(admin2, 'admin:watch', {})).toEqual({ ok: true, code });
    const game = await gameP;
    expect(game.phase).toBe('BOARD_QUESTION');
    expect(game.pausedAt).not.toBeNull();
    expect((await logP).at(-1)!.text).toContain('Server khởi động lại');

    // Người chơi vào lại bằng playerId đã lưu.
    const p1b = client(b.url);
    const qBack = waitFor<PublicQuestionView | null>(p1b, 'question:state', () => true);
    expect(await call(p1b, 'player:join', { roomCode: code, playerId: j1['playerId'] })).toMatchObject({ ok: true, teamId: 1 });
    const qv = (await qBack)!;
    expect(qv.roundId).toBe(q.roundId);
    expect(qv.locked.map((l) => l.teamId)).toEqual([1]);
    // Đang dừng: không bỏ phiếu được, câu không tự đóng.
    expect(await call(p1b, 'player:vote', { roundId: q.roundId, option: 1 })).toEqual({ ok: false, error: 'PAUSED' });

    const reveal = waitFor<GameView>(p1b, 'game:state', (v) => v.phase === 'BOARD_REVEAL');
    const resumed = waitFor<GameView>(p1b, 'game:state', (v) => v.pausedAt === null);
    expect(await call(admin2, 'admin:setPaused', { paused: false })).toEqual({ ok: true });
    expect((await resumed).phase).toBe('BOARD_QUESTION');
    const r = await reveal;
    expect(r.board!.standings.find((s) => s.teamId === 1)!.correct).toBe(1);
    await stop(b.server);
  });
});

describe('Admin qua Socket.IO: tạm dừng, nhật ký, dự phòng', () => {
  it('nhật ký chỉ tới admin; dự phòng chơi một lượt không cần điện thoại', async () => {
    const { server, url } = await start();
    const admin = client(url);
    await call(admin, 'admin:login', { password: 'pw' });
    const { code } = (await call(admin, 'admin:createRoom')) as unknown as { code: string };
    const host = client(url);
    await call(host, 'host:watch', { roomCode: code });
    const player = client(url);
    let playerGotLog = false;
    let hostGotLog = false;
    player.on('admin:log', () => (playerGotLog = true));
    host.on('admin:log', () => (hostGotLog = true));
    await call(player, 'player:join', { roomCode: code, name: 'Chi', teamId: 3 });
    // Chưa đăng nhập admin thì không điều khiển được.
    expect(await call(player, 'admin:setPaused', { paused: true })).toEqual({ ok: false, error: 'UNAUTHORIZED' });

    expect(await call(admin, 'admin:setFallback', { on: true })).toEqual({ ok: true });
    expect(await call(admin, 'admin:showRules')).toEqual({ ok: true });
    const sel = waitFor<GameView>(host, 'game:state', (v) => v.phase === 'BOARD_SELECT');
    await call(admin, 'admin:startBoard', { totalTurns: 1 });
    const g = await sel;
    expect(g.fallback).toBe(true);
    // Hết giờ SELECT nhưng không tự đóng.
    await new Promise((r) => setTimeout(r, DURATIONS.select + 200));
    const qOpen = waitFor<PublicQuestionView | null>(host, 'question:state', (v) => v?.status === 'open');
    expect(await call(admin, 'admin:fallbackSelect', { targets: { 1: OUTER_RING[1], 3: OUTER_RING[4] } })).toEqual({ ok: true });
    const q = (await qOpen)!;
    const reveal = waitFor<GameView>(host, 'game:state', (v) => v.phase === 'BOARD_REVEAL');
    const logged = waitFor<LogEntry[]>(admin, 'admin:log', (v) => v.some((e) => e.text.includes('chiếm')));
    expect(
      await call(admin, 'admin:fallbackAnswers', {
        answers: [
          { teamId: 1, choice: answerOf(q), rank: 1 },
          { teamId: 3, choice: (answerOf(q) + 1) % 4, rank: 2 },
        ],
      }),
    ).toEqual({ ok: true });
    const r = await reveal;
    expect(r.board!.owners[OUTER_RING[1]!]).toBe(1);
    expect(r.board!.owners[OUTER_RING[4]!]).toBeNull();
    const log = await logged;
    expect(log.some((e) => e.text.includes('Admin BẬT chế độ dự phòng'))).toBe(true);

    // Tạm dừng toàn cục giữa REVEAL: không chuyển pha.
    expect(await call(admin, 'admin:setPaused', { paused: true })).toEqual({ ok: true });
    await new Promise((res) => setTimeout(res, DURATIONS.boardReveal + 200));
    const intro = waitFor<GameView>(host, 'game:state', (v) => v.phase === 'BOMB_INTRO');
    expect(await call(admin, 'admin:setPaused', { paused: false })).toEqual({ ok: true });
    expect((await intro).bomb!.holder).toBe(1);

    expect(playerGotLog).toBe(false);
    expect(hostGotLog).toBe(false);
    await stop(server);
  });
});
