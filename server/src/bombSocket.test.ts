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
  type TeamPassView,
} from '@cnxh/shared';
import { createAppServer } from './app';

type Client = Socket<ServerToClientEvents, ClientToServerEvents>;
type Ack = { ok: boolean; error?: string; [k: string]: unknown };

const FUSE_MS = 1717;
const BANK: Question[] = [
  { id: 'b1', pool: 'board', topic: 't', type: 'mcq', prompt: 'Câu 1?', options: ['Đúng 1', 'X', 'Y', 'Z'], answerIndex: 0, explanation: 'g' },
  ...[1, 2, 3, 4].map(
    (i): Question => ({ id: `m${i}`, pool: 'bomb', topic: 't', type: 'tf', prompt: `Bom ${i}?`, options: ['Đúng', 'Sai'], answerIndex: 0, explanation: 'g' }),
  ),
];
const c = (q: number, r: number) => cellAt(q, r)!;

/** Có trường nào mang tên của ngòi, hoặc số nào bằng độ dài ngòi không? */
function leaksFuse(payload: unknown): boolean {
  const json = JSON.stringify(payload) ?? '';
  if (/fuse|remaining|burningSince|deadline/i.test(json)) return true;
  let found = false;
  JSON.parse(json, (_k, v) => {
    if (v === FUSE_MS) found = true;
    return v;
  });
  return found;
}

describe('Quả Bom qua Socket.IO', () => {
  const { httpServer, io } = createAppServer({
    adminPassword: 'pw',
    questions: BANK,
    durations: {
      select: 1500, board: 1500, boardReveal: 200,
      bomb: 1200, bombReveal: 200, bombPass: 1000, bombExplode: 200,
      fuseMin: FUSE_MS, fuseMax: FUSE_MS,
    },
  });
  let url = '';
  const sockets: Client[] = [];
  const client = (): Client => {
    const s: Client = connect(url, { transports: ['websocket'], forceNew: true });
    sockets.push(s);
    return s;
  };
  const acks: Ack[] = [];
  const call = (s: Client, event: string, ...args: unknown[]) =>
    new Promise<Ack>((resolve) =>
      (s as unknown as Socket).emit(event, ...args, (res: Ack) => {
        acks.push(res);
        resolve(res);
      }),
    );
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

  it('chơi trọn một quả bom; không payload/ack nào (host, admin, người chơi) chứa ngòi', async () => {
    const admin = client();
    await call(admin, 'admin:login', { password: 'pw' });
    const { code } = (await call(admin, 'admin:createRoom')) as unknown as { code: string };
    const host = client();
    await call(host, 'host:watch', { roomCode: code });
    const [p1, p2] = [client(), client()];
    await call(p1, 'player:join', { roomCode: code, name: 'A', teamId: 1 });
    await call(p2, 'player:join', { roomCode: code, name: 'B', teamId: 2 });
    const logs = [admin, host, p1, p2].map(record);
    const [adminLog, hostLog, p1Log, p2Log] = logs;
    const answerOf = (q: PublicQuestionView) => q.options.findIndex((o) => o.startsWith('Đúng'));

    // Bàn Cờ 1 lượt: nhóm 1 chiếm thêm 1 ô → dẫn đầu.
    const intro = waitFor<GameView>(host, 'game:state', (v) => v.phase === 'BOMB_INTRO');
    const selectOpen = waitFor<GameView>(host, 'game:state', (v) => v.phase === 'BOARD_SELECT');
    await call(admin, 'admin:startBoard', { totalTurns: 1 });
    const sel = (await selectOpen).board!.select!;
    const boardQ = waitFor<PublicQuestionView | null>(p1, 'question:state', (v) => v?.status === 'open');
    await call(p1, 'player:vote', { roundId: sel.roundId, option: c(1, -3) });
    await call(p1, 'player:lock', { roundId: sel.roundId });
    await call(p2, 'player:vote', { roundId: sel.roundId, option: c(2, -3) });
    await call(p2, 'player:lock', { roundId: sel.roundId });
    const q0 = (await boardQ)!;
    await call(p1, 'player:vote', { roundId: q0.roundId, option: answerOf(q0) });
    await call(p1, 'player:lock', { roundId: q0.roundId });
    await call(p2, 'player:vote', { roundId: q0.roundId, option: (answerOf(q0) + 1) % 4 });
    await call(p2, 'player:lock', { roundId: q0.roundId });
    const introView = await intro;
    expect(introView.bomb).toMatchObject({ bombNumber: 1, holder: 1, burning: false });

    // Quả bom (1 quả). Nhóm 1 cầm, trả lời đúng ngay.
    const q1P = waitFor<PublicQuestionView | null>(p1, 'question:state', (v) => v?.status === 'open' && v.pool === 'bomb');
    const burningAtHost = waitFor<GameView>(host, 'game:state', (v) => v.phase === 'BOMB_QUESTION');
    expect(await call(admin, 'admin:startBomb', { totalBombs: 1 })).toEqual({ ok: true });
    const q1 = (await q1P)!;
    const burning = await burningAtHost;
    expect(burning.bomb).toMatchObject({ holder: 1, burning: true, totalBombs: 1 });
    expect(burning.phaseEndsAt).toBe(q1.endsAt);
    expect(q1.teamIds).toEqual([1]);
    expect(await call(p2, 'player:vote', { roundId: q1.roundId, option: 0 })).toEqual({ ok: false, error: 'NOT_IN_ROUND' });

    const passAtP1 = waitFor<TeamPassView | null>(p1, 'pass:team', (v) => v !== null);
    await call(p1, 'player:vote', { roundId: q1.roundId, option: answerOf(q1) });
    await call(p1, 'player:lock', { roundId: q1.roundId });
    const pass = (await passAtP1)!;
    expect(pass.validTargets).toEqual([2]);

    // Chuyền cho nhóm 2; nhóm 2 không trả lời → ngòi cháy hết → nổ.
    const toTeam2 = waitFor<GameView>(host, 'game:state', (v) => v.phase === 'BOMB_QUESTION' && v.bomb?.holder === 2);
    const exploded = waitFor<GameView>(host, 'game:state', (v) => v.phase === 'BOMB_EXPLODE');
    const summary = waitFor<GameView>(host, 'game:state', (v) => v.phase === 'SUMMARY');
    await call(p1, 'player:vote', { roundId: pass.roundId, option: 2 });
    await call(p1, 'player:lock', { roundId: pass.roundId });
    expect((await toTeam2).bomb!.lastPass).toEqual({ from: 1, to: 2, random: false });
    const boom = await exploded;
    expect(boom.bomb!.explosions).toEqual([{ bombNumber: 1, teamId: 2, cells: [boom.bomb!.explosions[0]!.cells[0]] }]);
    expect(boom.board!.owners.includes(2)).toBe(false);
    expect(boom.bomb!.burning).toBe(false);
    const end = await summary;
    expect(end.bomb!.explosions).toHaveLength(1);

    // Không ai nhận được gì về ngòi — kể cả admin, kể cả ack.
    for (const log of logs) for (const { payload } of log) expect(leaksFuse(payload)).toBe(false);
    for (const ack of acks) expect(leaksFuse(ack)).toBe(false);

    // Phiếu chuyền bom chỉ tới thành viên nhóm cầm bom.
    expect(hostLog!.some((e) => e.event === 'pass:team')).toBe(false);
    expect(adminLog!.some((e) => e.event === 'pass:team')).toBe(false);
    expect(p2Log!.filter((e) => e.event === 'pass:team').every((e) => e.payload === null)).toBe(true);
    expect(p1Log!.some((e) => e.event === 'pass:team' && (e.payload as TeamPassView | null)?.teamId === 1)).toBe(true);
  }, 15_000);
});
