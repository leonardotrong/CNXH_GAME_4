import { describe, expect, it } from 'vitest';
import { loadQuestionBank } from './questionBank';

/** Quy tắc soạn câu hỏi: docs/CONTENT.md §5. "Từ" = tiếng, đếm theo dấu cách. */
const TOPICS = ['nguon-goc', 'ban-chat', 'chuc-nang', 'bo-may', 'dac-diem', 'tinh-huong'];
const words = (s: string) => s.trim().split(/\s+/).length;

describe('data/questions.json', () => {
  const questions = loadQuestionBank();
  const board = questions.filter((q) => q.pool === 'board');
  const bomb = questions.filter((q) => q.pool === 'bomb');

  it('đủ câu cho một trận: board ≥ 20 (14 lượt + dự phòng), bomb ≥ 35', () => {
    expect(board.length).toBeGreaterThanOrEqual(20);
    expect(bomb.length).toBeGreaterThanOrEqual(35);
  });

  it('mỗi câu có topic hợp lệ, giải thích và nguồn', () => {
    for (const q of questions) {
      expect(TOPICS, q.id).toContain(q.topic);
      expect(q.explanation.trim(), q.id).not.toBe('');
      expect(q.source?.trim(), q.id).toBeTruthy();
    }
  });

  it('kho board: câu ≤ 25 từ, mỗi phương án ≤ 10 từ', () => {
    for (const q of board) {
      expect(words(q.prompt), q.id).toBeLessThanOrEqual(25);
      for (const o of q.options) expect(words(o), `${q.id}: ${o}`).toBeLessThanOrEqual(10);
    }
  });

  it('kho bomb: câu ≤ 18 từ (đọc xong trong 3 giây)', () => {
    for (const q of bomb) expect(words(q.prompt), q.id).toBeLessThanOrEqual(18);
  });

  it('không trùng câu, không trùng phương án trong một câu', () => {
    const prompts = questions.map((q) => q.prompt.trim().toLowerCase());
    expect(new Set(prompts).size).toBe(prompts.length);
    for (const q of questions) expect(new Set(q.options).size, q.id).toBe(q.options.length);
  });

  it('phương án không phụ thuộc thứ tự (server trộn phương án mỗi lần hỏi)', () => {
    const allAbove = /tất cả (các )?(ý|phương án|đáp án)|(các|những) (ý|phương án|đáp án) trên/i;
    const byLetter = /(^|\s)[ABCD],? (và|hoặc) [ABCD](?=$|[\s.,])/;
    for (const q of questions) {
      for (const o of q.options) {
        expect(o, q.id).not.toMatch(allAbove);
        expect(o, q.id).not.toMatch(byLetter);
      }
    }
  });
});
