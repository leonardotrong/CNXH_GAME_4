/**
 * Đo lệch đồng hồ client ↔ server (GAME_SPEC 2.4).
 * Mỗi mẫu: client gửi lúc `sentAt`, server trả `serverTime`, client nhận lúc `receivedAt` (cùng giờ client).
 * Chọn mẫu có thời gian khứ hồi nhỏ nhất (ít nhiễu nhất), giả định đường đi và về bằng nhau.
 * offset = giờ server − giờ client  →  giờ server ≈ Date.now() + offset.
 */
export interface ClockSample {
  sentAt: number;
  serverTime: number;
  receivedAt: number;
}

export function estimateClockOffset(samples: readonly ClockSample[]): number {
  let best: ClockSample | null = null;
  for (const s of samples) {
    if (s.receivedAt < s.sentAt) continue;
    if (best === null || s.receivedAt - s.sentAt < best.receivedAt - best.sentAt) best = s;
  }
  if (best === null) return 0;
  return best.serverTime - (best.sentAt + best.receivedAt) / 2;
}

/** Số giây còn lại (làm tròn lên, không âm) để hiển thị đếm ngược. */
export function secondsLeft(endsAt: number, serverNow: number): number {
  return Math.max(0, Math.ceil((endsAt - serverNow) / 1000));
}
