import type { TeamId } from './lobby';

/** Câu hỏi (GAME_SPEC 2.3). */
export type QuestionPool = 'board' | 'bomb';
export type QuestionType = 'mcq' | 'tf';

export interface Question {
  id: string;
  pool: QuestionPool;
  topic: string;
  type: QuestionType;
  prompt: string;
  options: string[];
  answerIndex: number;
  explanation: string;
  source?: string;
}

export const QUESTION_DURATION_MS: Record<QuestionPool, number> = {
  board: 20_000,
  bomb: 12_000,
};
/** Thời gian host hiện đáp án + giải thích. */
export const REVEAL_DURATION_MS = 8_000;

export type Rng = () => number;

/** Kiểm tra ngân hàng câu hỏi; trả về danh sách lỗi (rỗng = hợp lệ). */
export function validateQuestionBank(raw: unknown): { questions: Question[]; errors: string[] } {
  const errors: string[] = [];
  const list = (raw as { questions?: unknown })?.questions;
  if (!Array.isArray(list)) return { questions: [], errors: ['Thiếu mảng "questions"'] };
  const ids = new Set<string>();
  const questions: Question[] = [];
  list.forEach((q: Partial<Question>, i) => {
    const where = `câu #${i} (${q?.id ?? '?'})`;
    const err = (msg: string) => errors.push(`${where}: ${msg}`);
    if (typeof q?.id !== 'string' || !q.id) return err('thiếu id');
    if (ids.has(q.id)) return err('trùng id');
    ids.add(q.id);
    if (q.pool !== 'board' && q.pool !== 'bomb') return err('pool phải là board|bomb');
    if (q.type !== 'mcq' && q.type !== 'tf') return err('type phải là mcq|tf');
    if (typeof q.prompt !== 'string' || !q.prompt.trim()) return err('thiếu prompt');
    if (!Array.isArray(q.options) || q.options.some((o) => typeof o !== 'string' || !o.trim()))
      return err('options không hợp lệ');
    if (q.pool === 'board' && q.options.length !== 4) return err('kho board cần đúng 4 phương án');
    if (q.pool === 'bomb' && (q.options.length < 2 || q.options.length > 3)) return err('kho bomb cần 2–3 phương án');
    if (q.type === 'tf' && (q.options.length !== 2 || q.options[0] !== 'Đúng' || q.options[1] !== 'Sai'))
      return err('câu đúng/sai phải có phương án ["Đúng", "Sai"]');
    if (!Number.isInteger(q.answerIndex) || q.answerIndex! < 0 || q.answerIndex! >= q.options.length)
      return err('answerIndex không hợp lệ');
    if (typeof q.explanation !== 'string' || !q.explanation.trim()) return err('thiếu explanation');
    questions.push(q as Question);
  });
  return { questions, errors };
}

/** Câu hỏi đã trộn phương án cho một lần hỏi. */
export interface PresentedQuestion {
  questionId: string;
  pool: QuestionPool;
  prompt: string;
  options: string[];
  /** Chỉ số đáp án đúng theo thứ tự ĐÃ TRỘN. Chỉ tồn tại trên server. */
  answerIndex: number;
  explanation: string;
}

/** Trộn phương án câu trắc nghiệm (Fisher–Yates); câu đúng/sai giữ nguyên thứ tự. */
export function presentQuestion(q: Question, rng: Rng = Math.random): PresentedQuestion {
  const order = q.options.map((_, i) => i);
  if (q.type === 'mcq') {
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [order[i], order[j]] = [order[j]!, order[i]!];
    }
  }
  return {
    questionId: q.id,
    pool: q.pool,
    prompt: q.prompt,
    options: order.map((i) => q.options[i]!),
    answerIndex: order.indexOf(q.answerIndex),
    explanation: q.explanation,
  };
}

/**
 * Chọn câu tiếp theo trong một kho:
 * - ưu tiên câu chưa hỏi trong trận;
 * - hết kho → dùng lại, ưu tiên câu ít nhóm đang trả lời đã gặp nhất.
 * `seenBy`: questionId → các nhóm đã gặp câu đó trong trận.
 */
export function pickQuestion(
  questions: readonly Question[],
  pool: QuestionPool,
  seenBy: ReadonlyMap<string, ReadonlySet<TeamId>>,
  answeringTeams: readonly TeamId[],
  rng: Rng = Math.random,
): Question | null {
  const inPool = questions.filter((q) => q.pool === pool);
  if (inPool.length === 0) return null;
  const score = (q: Question) => {
    const seen = seenBy.get(q.id);
    if (!seen) return -1; // chưa hỏi
    return answeringTeams.filter((t) => seen.has(t)).length;
  };
  const best = Math.min(...inPool.map(score));
  const candidates = inPool.filter((q) => score(q) === best);
  return candidates[Math.floor(rng() * candidates.length)]!;
}
