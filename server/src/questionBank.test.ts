import { describe, expect, it } from 'vitest';
import { loadQuestionBank } from './questionBank';

describe('data/questions.json', () => {
  it('hợp lệ theo quy tắc soạn câu hỏi và có cả hai kho', () => {
    const questions = loadQuestionBank();
    expect(questions.some((q) => q.pool === 'board')).toBe(true);
    expect(questions.some((q) => q.pool === 'bomb')).toBe(true);
  });
});
