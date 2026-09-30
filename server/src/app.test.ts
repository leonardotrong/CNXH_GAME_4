import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io as connect, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, HelloPayload, RoomState, ServerToClientEvents } from '@cnxh/shared';
import { createAppServer } from './app';

describe('server Socket.IO', () => {
  const { httpServer, io } = createAppServer();
  let url = '';

  beforeAll(async () => {
    await new Promise<void>((resolve) => httpServer.listen(0, resolve));
    url = `http://localhost:${(httpServer.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => io.close(() => resolve()));
  });

  it('gửi server:hello khi client kết nối và trả lời ping', async () => {
    const socket: Socket<ServerToClientEvents, ClientToServerEvents> = connect(url, {
      transports: ['websocket'],
    });
    try {
      const hello = await new Promise<HelloPayload>((resolve) => socket.once('server:hello', resolve));
      expect(typeof hello.serverTime).toBe('number');

      const serverTime = await new Promise<number>((resolve) => socket.emit('client:ping', resolve));
      expect(serverTime).toBeGreaterThanOrEqual(hello.serverTime);
    } finally {
      socket.disconnect();
    }
  });
});

describe('phòng chơi qua Socket.IO', () => {
  const { httpServer, io } = createAppServer({ adminPassword: 'secret' });
  let url = '';
  const sockets: Socket<ServerToClientEvents, ClientToServerEvents>[] = [];

  const client = () => {
    const s: Socket<ServerToClientEvents, ClientToServerEvents> = connect(url, { transports: ['websocket'] });
    sockets.push(s);
    return s;
  };
  const call = <T>(s: Socket, event: string, ...args: unknown[]) =>
    new Promise<T>((resolve) => (s as Socket<any, any>).emit(event, ...args, resolve));
  const nextState = (s: Socket<ServerToClientEvents, ClientToServerEvents>, pred: (st: RoomState) => boolean) =>
    new Promise<RoomState>((resolve) => {
      const on = (st: RoomState) => {
        if (pred(st)) {
          s.off('room:state', on);
          resolve(st);
        }
      };
      s.on('room:state', on);
    });

  beforeAll(async () => {
    await new Promise<void>((resolve) => httpServer.listen(0, resolve));
    url = `http://localhost:${(httpServer.address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    sockets.forEach((s) => s.disconnect());
    await new Promise<void>((resolve) => io.close(() => resolve()));
  });

  it('chặn admin sai mật khẩu; tạo phòng → host thấy, người chơi vào, admin đổi đội trưởng', async () => {
    const admin = client();
    expect(await call(admin, 'admin:createRoom')).toEqual({ ok: false, error: 'UNAUTHORIZED' });
    expect(await call(admin, 'admin:login', { password: 'sai' })).toEqual({ ok: false, error: 'UNAUTHORIZED' });
    expect(await call(admin, 'admin:login', { password: 'secret' })).toEqual({ ok: true });

    const host = client();
    expect(await call(host, 'host:watch', {})).toEqual({ ok: false, error: 'NO_ROOM' });
    const created = new Promise<{ code: string }>((resolve) => host.once('room:created', resolve));
    const { code } = await call<{ ok: true; code: string }>(admin, 'admin:createRoom');
    expect((await created).code).toBe(code);
    expect(await call(host, 'host:watch', { roomCode: code })).toMatchObject({ ok: true, code });

    const p1 = client();
    const p2 = client();
    const seen = nextState(host, (st) => st.teams[0]!.players.length === 2);
    const j1 = await call<{ ok: true; playerId: string }>(p1, 'player:join', { roomCode: code, name: 'An', teamId: 1 });
    const j2 = await call<{ ok: true; playerId: string }>(p2, 'player:join', { roomCode: code, name: 'Bình', teamId: 1 });
    const st = await seen;
    expect(st.teams[0]!.players.map((p) => [p.name, p.isCaptain])).toEqual([['An', true], ['Bình', false]]);

    const changed = nextState(host, (s) => s.teams[0]!.players.find((p) => p.name === 'Bình')!.isCaptain);
    expect(await call(admin, 'admin:setCaptain', { playerId: j2.playerId })).toEqual({ ok: true });
    await changed;

    // Tải lại trang: socket mới + playerId cũ → giữ nhóm.
    p1.disconnect();
    const p1b = client();
    expect(await call(p1b, 'player:join', { roomCode: code, playerId: j1.playerId })).toMatchObject({ ok: true, teamId: 1 });

    expect(await call(p1b, 'player:join', { roomCode: '0000x', name: 'X', teamId: 1 })).toEqual({ ok: false, error: 'BAD_REQUEST' });
  });
});
