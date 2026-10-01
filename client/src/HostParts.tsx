import type { ReactNode } from 'react';
import type { PublicQuestionView } from '@cnxh/shared';
import { OPTION_LABELS } from './QuestionPanel';
import { TerritoryBar } from './TerritoryBar';

/**
 * Thanh trên cùng của màn chiếu: nhãn (lượt / quả bom), tên pha, phần cuối (đồng hồ, nhãn bom…)
 * và thanh tỉ lệ lãnh thổ của các nhóm (khi có bàn cờ).
 */
export function HostBar({
  badge,
  title,
  owners,
  children,
}: {
  badge: ReactNode;
  title: ReactNode;
  owners?: readonly (number | null)[];
  children?: ReactNode;
}) {
  return (
    <header className="host-bar">
      <div className="host-bar__row">
        <span className="host-bar__badge">{badge}</span>
        <h1 className="host-bar__title">{title}</h1>
        <div className="host-bar__end">{children}</div>
      </div>
      {owners && <TerritoryBar owners={owners} minLabelShare={0} />}
    </header>
  );
}

/** Đáp án đúng + giải thích (REVEAL của Bàn Cờ và Quả Bom). */
export function AnswerCard({ question }: { question: PublicQuestionView }) {
  const reveal = question.reveal;
  if (!reveal) return null;
  return (
    <div className="answer">
      <p className="answer__label">Đáp án đúng</p>
      <p className="answer__text">
        <b>{OPTION_LABELS[reveal.answerIndex]}.</b> {question.options[reveal.answerIndex]}
      </p>
      <p className="answer__explanation">{reveal.explanation}</p>
    </div>
  );
}
