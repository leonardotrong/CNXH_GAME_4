import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io as connect, type Socket } from 'socket.io-client';
import {
  cellAt,
  type ClientToServerEvents,
  type GameView,
  type PublicQuestionView,
  type Question,
  type RoomState,
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

  it('SELECT không lộ mục tiêu; lật khi đóng; lượt được giải quyết; hết lượt → Quả Bom', async () => {
    const admin = client();
    await call(admin, 'admin:login', { password: 'pw' });
    const { code } = (await call(admin, 'admin:createRoom')) as unknown as { code: string };
    const host = client();
    await call(host, 'host:watch', { roomCode: code });
    const [p1, p2, p3] = [client(), client(), client()];
    await call(p1, 'player:join', { roomCode: code, name: 'A', teamId: 1 });
    await call(p2, 'player:join', { roomCode: code, name: 'B', teamId: 2 });
    // C cùng nhóm 2: nhóm 2 chỉ tự chốt khi cả B và C đã bỏ phiếu (GAME_SPEC 2.2).
    await call(p3, 'player:join', { roomCode: code, name: 'C', teamId: 2 });
    const [hostLog, p1Log, p2Log, p3Log] = [host, p1, p2, p3].map(record);

    // Câu thử không được mở khi đang chơi.
    const selectAtP1 = waitFor<TeamSelectView | null>(p1, 'select:team', (v) => v !== null);
    expect((await call(admin, 'admin:startBoard', { totalTurns: 3 })).ok).toBe(true);
    expect(await call(admin, 'admin:startQuestion', { pool: 'board' })).toEqual({ ok: false, error: 'WRONG_PHASE' });

    const sel = (await selectAtP1)!;
    expect(sel.teamId).toBe(1);
    expect(sel.validTargets).toContain(c(1, -3));

    expect((await call(p1, 'player:vote', { roundId: sel.roundId, option: c(1, -3) })).ok).toBe(true);
    // A là người online duy nhất của nhóm 1 → phiếu đã tự chốt.
    expect(await call(p1, 'player:lock', { roundId: sel.roundId })).toEqual({ ok: false, error: 'LOCKED' });
    expect((await call(p2, 'player:vote', { roundId: sel.roundId, option: c(2, -3) })).ok).toBe(true);

    // Trước khi SELECT đóng: không payload công khai nào có mục tiêu, không ai thấy phiếu nhóm khác.
    for (const log of [hostLog, p1Log, p2Log, p3Log]) {
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

    // Thành viên cuối của nhóm 2 bỏ phiếu → nhóm tự chốt → mọi nhóm đã chốt → SELECT đóng sớm, lật mục tiêu, mở câu hỏi.
    const questionAtHost = waitFor<GameView>(host, 'game:state', (v) => v.phase === 'BOARD_QUESTION');
    const qAtP1 = waitFor<PublicQuestionView | null>(p1, 'question:state', (v) => v?.status === 'open');
    expect((await call(p3, 'player:vote', { roundId: sel.roundId, option: c(2, -3) })).ok).toBe(true);
    const questionPhase = await questionAtHost;
    expect(questionPhase.board!.targets).toMatchObject({ 1: c(1, -3), 2: c(2, -3) });
    expect(questionPhase.board!.outcome).toBeNull();

    // Câu hỏi: nhóm 1 đúng, nhóm 2 sai → REVEAL.
    const q = (await qAtP1)!;
    const right = q.options.findIndex((o) => o.startsWith('Đúng'));
    const revealAtHost = waitFor<GameView>(host, 'game:state', (v) => v.phase === 'BOARD_REVEAL');
    await call(p1, 'player:vote', { roundId: q.roundId, option: right });
    await call(p2, 'player:vote', { roundId: q.roundId, option: (right + 1) % 4 });
    await call(p3, 'player:vote', { roundId: q.roundId, option: (right + 1) % 4 });
    const reveal = await revealAtHost;
    expect(reveal.board!.owners[c(1, -3)]).toBe(1);
    expect(reveal.board!.owners[c(2, -3)]).toBeNull();
    expect(reveal.board!.outcome!.cells.map((x) => x.result)).toEqual(['captured', 'failed']);

    // Kết quả lượt không xuất hiện trước REVEAL.
    for (const log of [hostLog, p1Log, p2Log, p3Log]) {
      const idx = log.findIndex((e) => e.event === 'game:state' && (e.payload as GameView).phase === 'BOARD_REVEAL');
      for (const { event, payload } of log.slice(0, idx)) {
        if (event === 'game:state') expect((payload as GameView).board?.outcome ?? null).toBeNull();
      }
    }

    // Hết REVEAL → lượt 2 tự bắt đầu. "Kết thúc sau lượt này" → không ai chơi, timer tự chạy hết lượt → BOMB_INTRO.
    const turn2 = await waitFor<GameView>(host, 'game:state', (v) => v.phase === 'BOARD_SELECT' && v.board?.turn === 2);
    expect(turn2.board!.targets).toBeNull();
    expect(turn2.board!.outcome).toBeNull();
    const summary = waitFor<GameView>(host, 'game:state', (v) => v.phase === 'BOMB_INTRO');
    expect((await call(admin, 'admin:endBoardAfterTurn', { value: true })).ok).toBe(true);
    const end = await summary;
    expect(end.board!.turn).toBe(2);
    expect(end.board!.standings[0]).toMatchObject({ teamId: 1, score: 2 });
  }, 15_000);

  it('chơi thử ở màn luật (GAME_SPEC 5.3): điện thoại chọn ô và trả lời như thật; hết lượt thử thì về màn luật; dừng được', async () => {
    const admin = client();
    await call(admin, 'admin:login', { password: 'pw' });
    const { code } = (await call(admin, 'admin:createRoom')) as unknown as { code: string };
    const host = client();
    await call(host, 'host:watch', { roomCode: code });
    const p1 = client();
    await call(p1, 'player:join', { roomCode: code, name: 'A', teamId: 1 });

    expect(await call(admin, 'admin:startPractice', {})).toEqual({ ok: false, error: 'WRONG_PHASE' }); // chưa hiện luật
    expect(await call(admin, 'admin:showRules')).toEqual({ ok: true });
    const selectAtP1 = waitFor<TeamSelectView | null>(p1, 'select:team', (v) => v !== null);
    const practiceAtHost = waitFor<GameView>(host, 'game:state', (v) => v.phase === 'BOARD_SELECT');
    expect(await call(admin, 'admin:startPractice', { turns: 1 })).toEqual({ ok: true });
    expect((await practiceAtHost).board).toMatchObject({ practice: true, turn: 1, totalTurns: 1 });

    // Nhóm 1 (một người) chọn ô → tự chốt → mọi nhóm đã chốt → câu hỏi; trả lời đúng → chiếm ô.
    const sel = (await selectAtP1)!;
    const qAtP1 = waitFor<PublicQuestionView | null>(p1, 'question:state', (v) => v?.status === 'open');
    await call(p1, 'player:vote', { roundId: sel.roundId, option: c(1, -3) });
    const q = (await qAtP1)!;
    const revealAtHost = waitFor<GameView>(host, 'game:state', (v) => v.phase === 'BOARD_REVEAL');
    const rulesAtHost = waitFor<GameView>(host, 'game:state', (v) => v.phase === 'RULES');
    await call(p1, 'player:vote', { roundId: q.roundId, option: q.options.findIndex((o) => o.startsWith('Đúng')) });
    const reveal = await revealAtHost;
    expect(reveal.board).toMatchObject({ practice: true });
    expect(reveal.board!.owners[c(1, -3)]).toBe(1);
    expect((await rulesAtHost).board).toBeNull(); // hết REVEAL của lượt thử cuối

    // Chơi thử lần nữa rồi dừng giữa chừng; sau đó trận thật bắt đầu từ bàn cờ xuất phát.
    expect(await call(admin, 'admin:stopPractice')).toEqual({ ok: false, error: 'WRONG_PHASE' });
    expect(await call(admin, 'admin:startPractice', {})).toEqual({ ok: true });
    const stopped = waitFor<GameView>(host, 'game:state', (v) => v.phase === 'RULES');
    expect(await call(admin, 'admin:stopPractice')).toEqual({ ok: true });
    expect((await stopped).board).toBeNull();
    const realAtHost = waitFor<GameView>(host, 'game:state', (v) => v.phase === 'BOARD_SELECT');
    expect(await call(admin, 'admin:startBoard', { totalTurns: 2 })).toEqual({ ok: true });
    const real = await realAtHost;
    expect(real.board).toMatchObject({ practice: false, turn: 1 });
    expect(real.board!.owners[c(1, -3)]).toBeNull();
  }, 15_000);

  it('nhóm trưởng tên là số nhóm tự thành đội trưởng; người dẫn thấy ngay trong nhật ký', async () => {
    const admin = client();
    await call(admin, 'admin:login', { password: 'pw' });
    const { code } = (await call(admin, 'admin:createRoom')) as unknown as { code: string };
    const [a, captain] = [client(), client()];
    await call(a, 'player:join', { roomCode: code, name: 'An', teamId: 3 });
    const logged = waitFor<{ text: string }[]>(admin, 'admin:log', (entries) => entries.some((e) => e.text.includes('làm đội trưởng Nhóm 3')));
    const stateAtA = waitFor<RoomState>(a, 'room:state', (st) => st.teams[2]!.players.length === 2);
    await call(captain, 'player:join', { roomCode: code, name: 'Nhóm 3', teamId: 3 });
    await logged;
    const team3 = (await stateAtA).teams[2]!;
    expect(team3.players.find((p) => p.isCaptain)?.name).toBe('Nhóm 3');
  });
});
