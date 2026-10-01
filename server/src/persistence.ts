import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { RoomSnapshot } from './room';

/** File trạng thái trận mặc định (đã nằm trong .gitignore). CHỈ SERVER — có ngòi bom. */
export const DEFAULT_STATE_FILE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../data/match.json');
/** Chỉ khôi phục trận lưu trong vòng 3 giờ (GAME_SPEC 6). */
export const MAX_STATE_AGE_MS = 3 * 60 * 60 * 1000;

/** Ghi nguyên tử: ghi file tạm rồi đổi tên, tránh file hỏng nếu server tắt giữa chừng. */
export function writeSnapshot(file: string, snap: RoomSnapshot): void {
  mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, JSON.stringify(snap));
  renameSync(tmp, file);
}

/** Đọc trận đã lưu; null nếu không có, hỏng, sai phiên bản hoặc cũ hơn `maxAgeMs`. */
export function readSnapshot(file: string, now: number = Date.now(), maxAgeMs: number = MAX_STATE_AGE_MS): RoomSnapshot | null {
  if (!existsSync(file)) return null;
  try {
    const snap = JSON.parse(readFileSync(file, 'utf8')) as RoomSnapshot;
    if (snap?.version !== 1 || typeof snap.savedAt !== 'number' || typeof snap.code !== 'string') return null;
    if (now - snap.savedAt > maxAgeMs) return null;
    return snap;
  } catch (err) {
    console.error(`[server] Không đọc được file trạng thái ${file}:`, err);
    return null;
  }
}
