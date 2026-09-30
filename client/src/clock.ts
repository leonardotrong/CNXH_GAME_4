import { useEffect, useState } from 'react';
import { estimateClockOffset, secondsLeft, type ClockSample } from '@cnxh/shared';
import { socket } from './socket';

/** Giờ server ≈ Date.now() + offset. Đo lại mỗi lần (tái) kết nối. */
let offset = 0;
const SAMPLES = 5;

function ping(): Promise<ClockSample> {
  return new Promise((resolve) => {
    const sentAt = Date.now();
    socket.timeout(3000).emit('client:ping', (err: Error | null, serverTime: number) => {
      const receivedAt = Date.now();
      // Mẫu lỗi: receivedAt < sentAt → bị bỏ qua khi ước lượng.
      resolve(err ? { sentAt, serverTime: 0, receivedAt: sentAt - 1 } : { sentAt, serverTime, receivedAt });
    });
  });
}

async function sync() {
  const samples: ClockSample[] = [];
  for (let i = 0; i < SAMPLES; i++) samples.push(await ping());
  if (samples.some((s) => s.receivedAt >= s.sentAt)) offset = estimateClockOffset(samples);
}

socket.on('connect', () => void sync());

export function serverNow(): number {
  return Date.now() + offset;
}

/** Số giây còn lại tới `endsAt` (giờ server), cập nhật ~4 lần/giây. */
export function useCountdown(endsAt: number | null | undefined): number {
  const [left, setLeft] = useState(() => (endsAt ? secondsLeft(endsAt, serverNow()) : 0));
  useEffect(() => {
    if (!endsAt) return setLeft(0);
    const tick = () => setLeft(secondsLeft(endsAt, serverNow()));
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [endsAt]);
  return left;
}
