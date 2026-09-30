import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io as connect, type Socket } from 'socket.io-client';
import {
  cellAt,
  type ClientToServerEvents,
  type GameView,
  type PublicQuestionView,
  type Question,
  type ServerToClientEvents,
  type TeamSelectView,
} from '@cnxh/shared';
import { createAppServer } from './app';

type Client = Socket<ServerToClientEvents, ClientToServerEvents>;
type Ack = { ok: boolean; error?: string; [k: string]: unknown };

const BANK: Question[] = [1, 2, 3].map((i) => ({
  id: `b${i}`, pool: 'board', topic: 't', type: 'mcq', prompt: `Câu ${i}?`,
  options: [`Đúng ${i}`, 'X', 'Y', 'Z'], answerIndex: 0, explanation: 'giải thích',
}));
const c = (q: number, r: number) => cellAt(q, r)!;

describe('Bàn Cờ qua Socket.IO', () => {
  const { httpServer, io } = createAppServer({
    adminPassword: 'pw',
    questions: BANK,
    durations: { select: 1500, board: 1500, boardReveal: 300 },
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
  const record = (s: Client) => {
    const log: { event: string; payload: unknown }[] = [];
    s.onAny((event, payload) => log.push({ event, payload }));
    return log;
  };

  beforeAll(async () => {
    await new Promise<void>((resolve) => httpServer.listen(0, resolve));
    url = `http://localhost:${(httpServer.address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    sockets.forEach((s) => s.disconnect());
    await new Promise<void>((resolve) => io.close(() => resolve()));
  });

  it('SELECT không lộ mục tiêu; lật khi đóng; lượt được giải quyết; hết lượt → kết thúc', async () => {
    const admin = client();
    await call(admin, 'admin:login', { password: 'pw' });
    const { code } = (await call(admin, 'admin:createRoom')) as unknown as { code: string };
    const host = client();
    await call(host, 'host:watch', { roomCode: code });
    const [p1, p2] = [client(), client()];
    await call(p1, 'player:join', { roomCode: code, name: 'A', teamId: 1 });
    await call(p2, 'player:join', { roomCode: code, name: 'B', teamId: 2 });
    const [hostLog, p1Log, p2Log] = [host, p1, p2].map(record);

    // Câu thử không được mở khi đang chơi.
    const selectAtP1 = waitFor<TeamSelectView | null>(p1, 'select:team', (v) => v !== null);
    expect((await call(admin, 'admin:startBoard', { totalTurns: 3 })).ok).toBe(true);
    expect(await call(admin, 'admin:startQuestion', { pool: 'board' })).toEqual({ ok: false, error: 'WRONG_PHASE' });

    const sel = (await selectAtP1)!;
    expect(sel.teamId).toBe(1);
    expect(sel.validTargets).toContain(c(1, -3));

    expect((await call(p1, 'player:vote', { roundId: sel.roundId, option: c(1, -3) })).ok).toBe(true);
    expect((await call(p1, 'player:lock', { roundId: sel.roundId })).ok).toBe(true);
    expect((await call(p2, 'player:vote', { roundId: sel.roundId, option: c(2, -3) })).ok).toBe(true);

    // Trước khi SELECT đóng: không payload công khai nào có mục tiêu, không ai thấy phiếu nhóm khác.
    for (const log of [hostLog, p1Log, p2Log]) {
      for (const { event, payload } of log) {
        if (event !== 'game:state') continue;
        const board = (payload as GameView).board;
        expect(board?.targets ?? null).toBeNull();
        expect(board?.select?.targets ?? null).toBeNull();
      }
    }
    expect(hostLog.some((e) => e.event === 'select:team')).toBe(false);
    expect(p2Log.filter((e) => e.event === 'select:team').every((e) => (e.payload as TeamSelectView | null)?.teamId !== 1)).toBe(true);
    expect(p1Log.filter((e) => e.event === 'select:team').every((e) => (e.payload as TeamSelectView | null)?.teamId !== 2)).toBe(true);

    // Nhóm cuối chốt → SELECT đóng sớm, lật mục tiêu, mở câu hỏi.
    const questionAtHost = waitFor<GameView>(host, 'game:state', (v) => v.phase === 'BOARD_QUESTION');
    const qAtP1 = waitFor<PublicQuestionView | null>(p1, 'question:state', (v) => v?.status === 'open');
    expect((await call(p2, 'player:lock', { roundId: sel.roundId })).ok).toBe(true);
    const questionPhase = await questionAtHost;
    expect(questionPhase.board!.targets).toMatchObject({ 1: c(1, -3), 2: c(2, -3) });
    expect(questionPhase.board!.outcome).toBeNull();

    // Câu hỏi: nhóm 1 đúng, nhóm 2 sai → REVEAL.
    const q = (await qAtP1)!;
    const right = q.options.findIndex((o) => o.startsWith('Đúng'));
    const revealAtHost = waitFor<GameView>(host, 'game:state', (v) => v.phase === 'BOARD_REVEAL');
    await call(p1, 'player:vote', { roundId: q.roundId, option: right });
    await call(p2, 'player:vote', { roundId: q.roundId, option: (right + 1) % 4 });
    await call(p1, 'player:lock', { roundId: q.roundId });
    await call(p2, 'player:lock', { roundId: q.roundId });
    const reveal = await revealAtHost;
    expect(reveal.board!.owners[c(1, -3)]).toBe(1);
    expect(reveal.board!.owners[c(2, -3)]).toBeNull();
    expect(reveal.board!.outcome!.cells.map((x) => x.result)).toEqual(['captured', 'failed']);

    // Kết quả lượt không xuất hiện trước REVEAL.
    for (const log of [hostLog, p1Log, p2Log]) {
      const idx = log.findIndex((e) => e.event === 'game:state' && (e.payload as GameView).phase === 'BOARD_REVEAL');
      for (const { event, payload } of log.slice(0, idx)) {
        if (event === 'game:state') expect((payload as GameView).board?.outcome ?? null).toBeNull();
      }
    }

    // Hết REVEAL → lượt 2 tự bắt đầu. "Kết thúc sau lượt này" → không ai chơi, timer tự chạy hết lượt → SUMMARY.
    const turn2 = await waitFor<GameView>(host, 'game:state', (v) => v.phase === 'BOARD_SELECT' && v.board?.turn === 2);
    expect(turn2.board!.targets).toBeNull();
    expect(turn2.board!.outcome).toBeNull();
    const summary = waitFor<GameView>(host, 'game:state', (v) => v.phase === 'SUMMARY');
    expect((await call(admin, 'admin:endBoardAfterTurn', { value: true })).ok).toBe(true);
    const end = await summary;
    expect(end.board!.turn).toBe(2);
    expect(end.board!.standings[0]).toMatchObject({ teamId: 1, score: 2 });
  }, 15_000);
});
