import { describe, expect, it } from 'vitest';
import { estimateClockOffset, secondsLeft } from './clock';

describe('estimateClockOffset', () => {
  it('không có mẫu → 0', () => {
    expect(estimateClockOffset([])).toBe(0);
  });
  it('trễ đối xứng: server nhanh hơn 1000ms', () => {
    // client gửi lúc 0, server (nhanh 1000) nhận lúc 50 giờ client = 1050, client nhận lúc 100
    expect(estimateClockOffset([{ sentAt: 0, serverTime: 1050, receivedAt: 100 }])).toBe(1000);
  });
  it('server chậm hơn → offset âm', () => {
    expect(estimateClockOffset([{ sentAt: 1000, serverTime: 520, receivedAt: 1040 }])).toBe(-500);
  });
  it('chọn mẫu có thời gian khứ hồi nhỏ nhất', () => {
    const samples = [
      { sentAt: 0, serverTime: 5000, receivedAt: 800 }, // nhiễu
      { sentAt: 1000, serverTime: 3020, receivedAt: 1040 }, // RTT 40 → offset 2000
      { sentAt: 2000, serverTime: 4200, receivedAt: 2300 },
    ];
    expect(estimateClockOffset(samples)).toBe(2000);
  });
  it('bỏ qua mẫu hỏng (nhận trước khi gửi)', () => {
    expect(estimateClockOffset([{ sentAt: 10, serverTime: 0, receivedAt: 5 }])).toBe(0);
  });
});

describe('secondsLeft', () => {
  it('làm tròn lên và không âm', () => {
    expect(secondsLeft(10_000, 0)).toBe(10);
    expect(secondsLeft(10_000, 9_001)).toBe(1);
    expect(secondsLeft(10_000, 10_000)).toBe(0);
    expect(secondsLeft(10_000, 12_000)).toBe(0);
  });
});
