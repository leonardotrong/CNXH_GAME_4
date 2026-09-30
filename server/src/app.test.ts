import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io as connect, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, HelloPayload, ServerToClientEvents } from '@cnxh/shared';
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
