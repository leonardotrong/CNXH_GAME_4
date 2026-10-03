import { useEffect, useRef } from 'react';
import { secondsLeft, type GameView, type PublicQuestionView } from '@cnxh/shared';
import { clockNow } from './clock';
import { sounds } from './sound';

/** Nhịp tích tắc CỐ ĐỊNH của bom (ms) — không liên quan tới ngòi. */
const TICK_MS = 500;

/** Âm thanh trên màn chiếu, suy ra từ thay đổi trạng thái công khai. */
export function useHostSounds(game: GameView | null, question: PublicQuestionView | null): void {
  const prev = useRef<{ game: GameView | null; question: PublicQuestionView | null } | null>(null);

  // Sự kiện: câu mới, chọn ô, kết quả lượt, chuyền bom, nổ, kết thúc.
  useEffect(() => {
    const p = prev.current;
    prev.current = { game, question };
    if (!p || !game) return;
    const entered = (phase: GameView['phase']) => game.phase === phase && p.game?.phase !== phase;

    if (question?.status === 'open' && p.question?.roundId !== question.roundId) sounds.newQuestion();
    if (entered('BOARD_SELECT')) {
      sounds.newQuestion();
      if (game.board?.newStar != null) setTimeout(() => sounds.star(), 450);
    }
    if (entered('BOARD_REVEAL') && game.board?.outcome) {
      const cells = game.board.outcome.cells;
      const captured = cells.filter((c) => c.result === 'captured');
      if (captured.length > 0) {
        sounds.capture();
        if (captured.some((c) => c.previousOwner !== null)) setTimeout(() => sounds.loss(), 650);
      } else if (cells.some((c) => c.result === 'defended')) sounds.defend();
    }
    const pass = game.bomb?.lastPass;
    const prevPass = p.game?.bomb?.lastPass;
    if (game.phase === 'BOMB_QUESTION' && pass && (prevPass?.from !== pass.from || prevPass.to !== pass.to || p.game?.phase === 'BOMB_PASS')) {
      sounds.whoosh();
    }
    if (entered('BOMB_EXPLODE')) sounds.explode();
    if (entered('SUMMARY')) sounds.victory();
  }, [game, question]);

  // Bíp 5 giây cuối (câu hỏi Bàn Cờ, chọn ô, chọn nhóm nhận bom). Câu bom đã có tích tắc nên không bíp.
  const endsAt =
    question?.status === 'open' && question.pool === 'board'
      ? question.endsAt
      : game?.phase === 'BOARD_SELECT' || game?.phase === 'BOMB_PASS'
        ? game.phaseEndsAt
        : null;
  useEffect(() => {
    if (!endsAt) return;
    let last = secondsLeft(endsAt, clockNow());
    const id = setInterval(() => {
      const s = secondsLeft(endsAt, clockNow());
      if (s !== last && s >= 1 && s <= 5) sounds.countdown(s);
      last = s;
    }, 200);
    return () => clearInterval(id);
  }, [endsAt]);

  // Tích tắc khi bom đang cháy.
  const burning = game?.phase === 'BOMB_QUESTION' && !!game.bomb?.burning && game.pausedAt === null;
  useEffect(() => {
    if (!burning) return;
    let tock = false;
    const id = setInterval(() => {
      sounds.tick(tock);
      tock = !tock;
    }, TICK_MS);
    return () => clearInterval(id);
  }, [burning]);
}
