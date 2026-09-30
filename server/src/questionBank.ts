import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateQuestionBank, type Question } from '@cnxh/shared';

export const QUESTIONS_FILE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../data/questions.json');

/** Đọc và kiểm tra ngân hàng câu hỏi; lỗi định dạng → dừng server ngay để sửa trước buổi học. */
export function loadQuestionBank(file: string = QUESTIONS_FILE): Question[] {
  const { questions, errors } = validateQuestionBank(JSON.parse(readFileSync(file, 'utf8')));
  if (errors.length > 0) throw new Error(`Ngân hàng câu hỏi ${file} có lỗi:\n- ${errors.join('\n- ')}`);
  return questions;
}
