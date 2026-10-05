import { DEFAULT_BOARD_TURNS, DEFAULT_BOMB_COUNT, type GameView, type Phase, type PublicQuestionView } from '@cnxh/shared';
import { ACK_TIMEOUT_MS, orNetworkError, socket } from './socket';

/**
 * "Bước tiếp theo" của người dẫn (GAME_SPEC 5.3): một thao tác duy nhất cho mỗi lúc,
 * dùng chung cho nút lớn trên /admin và phím Space trên /host.
 */

type Done = (res: { ok: boolean; error?: string }) => void;

/** Lệnh có hạn chờ: rớt mạng vẫn gọi `done` (NETWORK) để nút không kẹt ở trạng thái bận. */
const send = () => socket.timeout(ACK_TIMEOUT_MS);

export interface StepOptions {
  /** Số lượt Bàn Cờ khi bắt đầu. */
  turns: number;
  /** Số quả bom khi bắt đầu Quả Bom. */
  bombs: number;
}

export const DEFAULT_STEP_OPTIONS: StepOptions = { turns: DEFAULT_BOARD_TURNS, bombs: DEFAULT_BOMB_COUNT };

export interface NextStep {
  /** Nhãn nút (động từ). */
  label: string;
  /** Một câu giải thích điều sẽ xảy ra / đang xảy ra. */
  hint: string;
  /** null = không có gì để bấm (pha tự chạy hoặc chờ). */
  run: ((opts: StepOptions, done: Done) => void) | null;
  /** Cần chỉnh số lượt / số bom trước khi bấm. */
  setting?: 'turns' | 'bombs';
}

/** Năm chặng của buổi chơi, để hiện thanh tiến trình. */
export const STAGES = ['Phòng chờ', 'Luật chơi', 'Bàn Cờ', 'Quả Bom', 'Tổng kết'] as const;

export function stageOf(phase: Phase | undefined): number {
  if (!phase || phase === 'LOBBY') return 0;
  if (phase === 'RULES') return 1;
  if (phase.startsWith('BOARD_')) return 2;
  if (phase.startsWith('BOMB_')) return 3;
  return 4;
}

/** Pha ngoài trận: mở được câu thử (GAME_SPEC 5.3). */
export const TEST_PHASES: readonly Phase[] = ['LOBBY', 'RULES', 'SUMMARY'];

/** Pha cần người dẫn nhập kết quả khi bật chế độ dự phòng. */
const MANUAL_PHASES: readonly Phase[] = ['BOARD_SELECT', 'BOARD_QUESTION', 'BOMB_QUESTION', 'BOMB_PASS'];

const RUNNING: Partial<Record<Phase, string>> = {
  BOARD_SELECT: 'Các nhóm đang chọn ô',
  BOARD_QUESTION: 'Các nhóm đang trả lời',
  BOARD_REVEAL: 'Đang công bố kết quả lượt',
  BOMB_QUESTION: 'Nhóm cầm bom đang trả lời',
  BOMB_REVEAL: 'Đang công bố đáp án',
  BOMB_PASS: 'Nhóm cầm bom đang chọn nhóm nhận',
  BOMB_EXPLODE: 'Bom nổ!',
};

/**
 * Việc phụ cạnh "Bước tiếp theo" ở màn luật: cả lớp chơi thử một câu (không tính điểm) trước khi bắt đầu Bàn Cờ.
 * Nút trên /admin và phím T trên /host.
 */
export function practiceStep(game: GameView | null, question: PublicQuestionView | null): NextStep | null {
  if (!game || game.phase !== 'RULES' || question || game.pausedAt !== null) return null;
  return {
    label: 'Chơi thử một câu',
    hint: 'Cả lớp tập biểu quyết và CHỐT trên điện thoại, không tính điểm; xong quay lại màn luật.',
    run: (_, done) => send().emit('admin:startQuestion', { pool: 'board' }, orNetworkError(done)),
  };
}

export function nextStep(hasRoom: boolean, game: GameView | null, question: PublicQuestionView | null): NextStep {
  if (!hasRoom) {
    return {
      label: 'Tạo phòng',
      hint: 'Màn chiếu sẽ hiện mã QR để sinh viên quét.',
      run: (_, done) => send().emit('admin:createRoom', orNetworkError(done)),
    };
  }
  if (!game) return { label: 'Đang kết nối…', hint: '', run: null };
  if (game.pausedAt !== null) {
    return {
      label: 'Tiếp tục trận',
      hint: 'Đồng hồ và bom chạy tiếp từ đúng chỗ đã dừng.',
      run: (_, done) => send().emit('admin:setPaused', { paused: false }, orNetworkError(done)),
    };
  }
  const { phase } = game;
  // Câu thử ngoài trận: chạy trọn (kể cả phần đáp án) rồi mới sang bước tiếp theo.
  if (question && TEST_PHASES.includes(phase)) {
    return {
      label: 'Câu thử đang chạy',
      hint:
        question.status === 'open'
          ? 'Tự đóng khi hết giờ hoặc khi mọi nhóm đã chốt.'
          : phase === 'RULES'
            ? 'Đang hiện đáp án — vài giây nữa màn chiếu quay lại màn luật.'
            : 'Đang hiện đáp án câu thử.',
      run: null,
    };
  }
  switch (phase) {
    case 'LOBBY':
      return {
        label: 'Hiện luật chơi',
        hint: 'Màn chiếu hiện luật tóm tắt. Sinh viên vào muộn vẫn vào được.',
        run: (_, done) => send().emit('admin:showRules', orNetworkError(done)),
      };
    case 'RULES':
      return {
        label: 'Bắt đầu Bàn Cờ',
        hint: 'Mỗi lượt tự chạy khoảng 45 giây: chọn ô → trả lời → kết quả. Lớp chưa quen thì cho chơi thử một câu trước.',
        run: (opts, done) => send().emit('admin:startBoard', { totalTurns: opts.turns }, orNetworkError(done)),
        setting: 'turns',
      };
    case 'BOMB_INTRO':
      return {
        label: 'Bắt đầu Quả Bom',
        hint: 'Nhóm đang dẫn đầu cầm quả bom đầu tiên.',
        run: (opts, done) => send().emit('admin:startBomb', { totalBombs: opts.bombs }, orNetworkError(done)),
        setting: 'bombs',
      };
    case 'SUMMARY':
      return game.summaryView === 'ranking'
        ? {
            label: 'Hiện tổng kết bài học',
            hint: '6 đặc điểm của nhà nước pháp quyền XHCN Việt Nam.',
            run: (_, done) => send().emit('admin:setSummaryView', { view: 'lessons' }, orNetworkError(done)),
          }
        : {
            label: 'Hiện lại bảng xếp hạng',
            hint: 'Buổi chơi đã xong. Muốn chơi lại: dùng "Chơi lại Bàn Cờ" bên dưới.',
            run: (_, done) => send().emit('admin:setSummaryView', { view: 'ranking' }, orNetworkError(done)),
          };
    default:
      return {
        label: RUNNING[phase] ?? 'Đang chạy',
        hint:
          game.fallback && MANUAL_PHASES.includes(phase)
            ? 'Chế độ dự phòng: nhập kết quả từ thẻ màu ở bảng bên dưới.'
            : 'Pha tự chạy — không cần bấm gì.',
        run: null,
      };
  }
}
