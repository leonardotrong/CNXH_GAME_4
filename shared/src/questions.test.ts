import { describe, expect, it } from 'vitest';
import { pickQuestion, presentQuestion, validateQuestionBank, type Question } from './questions';

const mcq: Question = {
  id: 'm1', pool: 'board', topic: 't', type: 'mcq', prompt: 'P?',
  options: ['A', 'B', 'C', 'D'], answerIndex: 2, explanation: 'vì C',
};
const tf: Question = {
  id: 't1', pool: 'bomb', topic: 't', type: 'tf', prompt: 'Q',
  options: ['Đúng', 'Sai'], answerIndex: 1, explanation: 'sai',
};

/** RNG xác định để test. */
function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2 ** 31;
    return s / 2 ** 31;
  };
}

describe('validateQuestionBank', () => {
  it('bắt lỗi answerIndex, số phương án, trùng id, đúng/sai sai định dạng', () => {
    const { errors } = validateQuestionBank({
      questions: [
        { ...mcq, id: 'm0', answerIndex: 4 },
        { ...mcq, id: 'm2', options: ['A', 'B', 'C'] },
        mcq,
        { ...mcq, id: 'm1' },
        { ...tf, options: ['Sai', 'Đúng'] },
      ],
    });
    expect(errors).toHaveLength(4);
  });
  it('thiếu mảng questions', () => {
    expect(validateQuestionBank({}).errors).toHaveLength(1);
  });
});

describe('presentQuestion', () => {
  it('trộn phương án câu trắc nghiệm nhưng đáp án vẫn trỏ đúng nội dung', () => {
    const orders = new Set<string>();
    for (let seed = 1; seed <= 30; seed++) {
      const p = presentQuestion(mcq, seeded(seed));
      expect([...p.options].sort()).toEqual(['A', 'B', 'C', 'D']);
      expect(p.options[p.answerIndex]).toBe('C');
      orders.add(p.options.join(''));
    }
    expect(orders.size).toBeGreaterThan(5);
  });
  it('câu đúng/sai giữ nguyên "Đúng", "Sai"', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const p = presentQuestion(tf, seeded(seed));
      expect(p.options).toEqual(['Đúng', 'Sai']);
      expect(p.answerIndex).toBe(1);
    }
  });
});

describe('pickQuestion', () => {
  const bank: Question[] = [mcq, { ...mcq, id: 'm2' }, { ...mcq, id: 'm3' }, tf];

  it('chỉ chọn trong kho được yêu cầu; kho rỗng → null', () => {
    expect(pickQuestion(bank, 'bomb', new Map(), [1])!.id).toBe('t1');
    expect(pickQuestion([mcq], 'bomb', new Map(), [1])).toBeNull();
  });
  it('không lặp câu khi còn câu chưa hỏi', () => {
    const seen = new Map([['m1', new Set([1])], ['m2', new Set([2])]]);
    for (let seed = 1; seed <= 10; seed++) expect(pickQuestion(bank, 'board', seen, [1, 2], seeded(seed))!.id).toBe('m3');
  });
  it('hết kho → ưu tiên câu nhóm đang trả lời chưa gặp', () => {
    const seen = new Map([['m1', new Set([1])], ['m2', new Set([2])], ['m3', new Set([1, 2])]]);
    for (let seed = 1; seed <= 10; seed++) expect(pickQuestion(bank, 'board', seen, [2], seeded(seed))!.id).toBe('m1');
  });
});
