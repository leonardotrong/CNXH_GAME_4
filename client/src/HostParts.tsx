import type { ReactNode } from 'react';
import type { PublicQuestionView } from '@cnxh/shared';
import { OPTION_LABELS } from './QuestionPanel';

/** Thanh trên cùng của màn chiếu: lượt / quả bom, tên pha, phần cuối (đồng hồ, nhãn bom…). */
export function HostBar({ badge, title, children }: { badge: ReactNode; title: ReactNode; children?: ReactNode }) {
  return (
    <header className="host-bar">
      <span className="host-bar__badge">{badge}</span>
      <h1 className="host-bar__title">{title}</h1>
      <div className="host-bar__end">{children}</div>
    </header>
  );
}

/** Thẻ đáp án đúng + giải thích (REVEAL của Bàn Cờ và Quả Bom). */
export function AnswerCard({ question }: { question: PublicQuestionView }) {
  const reveal = question.reveal;
  if (!reveal) return null;
  return (
    <div className="answer-card">
      <p className="answer-card__label">Đáp án đúng</p>
      <p className="answer-card__answer">
        <b className="answer-card__letter">{OPTION_LABELS[reveal.answerIndex]}</b>
        <span>{question.options[reveal.answerIndex]}</span>
      </p>
      <p className="answer-card__explanation">{reveal.explanation}</p>
    </div>
  );
}
