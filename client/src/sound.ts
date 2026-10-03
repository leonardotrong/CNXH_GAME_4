/**
 * Âm thanh tạo bằng Web Audio API (GAME_SPEC 6) — không dùng file, khỏi lo bản quyền.
 * Trình duyệt chỉ cho phát sau một thao tác của người dùng: gọi `unlockAudio()` trong sự kiện bấm/chạm.
 *
 * Tích tắc của bom có nhịp CỐ ĐỊNH: không bao giờ phụ thuộc thời gian còn lại của ngòi (client không biết).
 */
import { useEffect, useState } from 'react';

const MUTE_KEY = 'cnxh.muted';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = (() => {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
})();
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((fn) => fn());

function audio(): AudioContext | null {
  if (ctx) return ctx;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  ctx = new Ctor();
  master = ctx.createGain();
  master.gain.value = muted ? 0 : 0.8;
  master.connect(ctx.destination);
  ctx.addEventListener('statechange', notify);
  return ctx;
}

/** Gọi trong sự kiện bấm/chạm để trình duyệt cho phép phát âm thanh. */
export function unlockAudio(): void {
  const c = audio();
  if (c && c.state !== 'running') void c.resume().then(notify);
}

export function isAudioReady(): boolean {
  return ctx?.state === 'running';
}

export function isMuted(): boolean {
  return muted;
}

export function setMuted(value: boolean): void {
  muted = value;
  try {
    localStorage.setItem(MUTE_KEY, value ? '1' : '0');
  } catch {
    /* bỏ qua */
  }
  if (master && ctx) master.gain.setTargetAtTime(value ? 0 : 0.8, ctx.currentTime, 0.02);
  notify();
}

/** Trạng thái âm thanh cho nút bật/tắt. */
export function useSoundState(): { muted: boolean; ready: boolean } {
  const [, force] = useState(0);
  useEffect(() => {
    const fn = () => force((n) => n + 1);
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  }, []);
  return { muted, ready: isAudioReady() };
}

// ─── Khối tạo âm ─────────────────────────────────────────────────────────────

function playable(): AudioContext | null {
  const c = ctx;
  return c && c.state === 'running' && !muted && master ? c : null;
}

function tone(freq: number, start: number, dur: number, opts: { type?: OscillatorType; gain?: number; slideTo?: number } = {}): void {
  const c = playable();
  if (!c) return;
  const t = c.currentTime + start;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = opts.type ?? 'sine';
  osc.frequency.setValueAtTime(freq, t);
  if (opts.slideTo) osc.frequency.exponentialRampToValueAtTime(opts.slideTo, t + dur);
  const peak = opts.gain ?? 0.3;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(master!);
  osc.start(t);
  osc.stop(t + dur + 0.05);
}

function noise(start: number, dur: number, opts: { gain?: number; from?: number; to?: number } = {}): void {
  const c = playable();
  if (!c) return;
  const t = c.currentTime + start;
  const buffer = c.createBuffer(1, Math.ceil(c.sampleRate * dur), c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource();
  src.buffer = buffer;
  const filter = c.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(opts.from ?? 4000, t);
  filter.frequency.exponentialRampToValueAtTime(opts.to ?? 120, t + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(opts.gain ?? 0.8, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(filter).connect(g).connect(master!);
  src.start(t);
}

// ─── Hiệu ứng ────────────────────────────────────────────────────────────────

export const sounds = {
  /** Câu hỏi mới / pha chọn ô mới. */
  newQuestion() {
    tone(660, 0, 0.18, { type: 'triangle', gain: 0.3 });
    tone(990, 0.14, 0.3, { type: 'triangle', gain: 0.3 });
  },
  /** Một tiếng bíp mỗi giây trong 5 giây cuối. */
  countdown(secondsLeft: number) {
    tone(secondsLeft <= 1 ? 1320 : 880, 0, 0.12, { type: 'square', gain: 0.12 });
  },
  /** Chiếm ô. */
  capture() {
    [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.09, 0.25, { type: 'triangle', gain: 0.25 }));
  },
  /** Mất ô. */
  loss() {
    tone(392, 0, 0.25, { type: 'sawtooth', gain: 0.12, slideTo: 330 });
    tone(294, 0.22, 0.45, { type: 'sawtooth', gain: 0.12, slideTo: 196 });
  },
  /** Phòng thủ thành công. */
  defend() {
    tone(440, 0, 0.12, { type: 'square', gain: 0.12 });
    tone(440, 0.15, 0.25, { type: 'square', gain: 0.12 });
  },
  /** Tích hoặc tắc của bom (gọi theo nhịp cố định). */
  tick(tock: boolean) {
    tone(tock ? 1400 : 1900, 0, 0.04, { type: 'square', gain: 0.1 });
  },
  /** Bom nổ. */
  explode() {
    noise(0, 1.6, { gain: 0.9, from: 5000, to: 80 });
    tone(110, 0, 1.2, { type: 'sine', gain: 0.6, slideTo: 35 });
  },
  /** ★ Lòng dân xuất hiện: tiếng lấp lánh. */
  star() {
    [1047, 1319, 1568, 2093, 1568, 2093].forEach((f, i) => tone(f, i * 0.07, 0.22, { type: 'sine', gain: 0.18 }));
  },
  /** Chuyền bom. */
  whoosh() {
    noise(0, 0.45, { gain: 0.35, from: 600, to: 4000 });
  },
  /** Chiến thắng. */
  victory() {
    const notes: [number, number, number][] = [
      [523, 0, 0.18],
      [659, 0.18, 0.18],
      [784, 0.36, 0.18],
      [1047, 0.54, 0.5],
      [784, 0.9, 0.16],
      [1047, 1.06, 0.8],
    ];
    notes.forEach(([f, s, d]) => tone(f, s, d, { type: 'triangle', gain: 0.3 }));
  },
};
