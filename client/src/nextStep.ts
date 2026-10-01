import { DEFAULT_BOARD_TURNS, DEFAULT_BOMB_COUNT, type GameView, type Phase, type PublicQuestionView } from '@cnxh/shared';
import { socket } from './socket';

/**
 * "Bước tiếp theo" của người dẫn (GAME_SPEC 5.3): một thao tác duy nhất cho mỗi lúc,
 * dùng chung cho nút lớn trên /admin và phím Space trên /host.
 */

type Done = (res: { ok: boolean; error?: string }) => void;

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

export function nextStep(hasRoom: boolean, game: GameView | null, question: PublicQuestionView | null): NextStep {
  if (!hasRoom) {
    return {
      label: 'Tạo phòng',
      hint: 'Màn chiếu sẽ hiện mã QR để sinh viên quét.',
      run: (_, done) => socket.emit('admin:createRoom', done),
    };
  }
  if (!game) return { label: 'Đang kết nối…', hint: '', run: null };
  if (game.pausedAt !== null) {
    return {
      label: 'Tiếp tục trận',
      hint: 'Đồng hồ và bom chạy tiếp từ đúng chỗ đã dừng.',
      run: (_, done) => socket.emit('admin:setPaused', { paused: false }, done),
    };
  }
  const { phase } = game;
  // Câu thử ngoài trận (LOBBY/SUMMARY).
  if (question && (phase === 'LOBBY' || phase === 'SUMMARY')) {
    return { label: 'Câu thử đang chạy', hint: 'Tự đóng khi hết giờ hoặc khi mọi nhóm đã chốt.', run: null };
  }
  switch (phase) {
    case 'LOBBY':
      return {
        label: 'Hiện luật chơi',
        hint: 'Màn chiếu hiện luật tóm tắt. Sinh viên vào muộn vẫn vào được.',
        run: (_, done) => socket.emit('admin:showRules', done),
      };
    case 'RULES':
      return {
        label: 'Bắt đầu Bàn Cờ',
        hint: 'Mỗi lượt tự chạy khoảng 45 giây: chọn ô → trả lời → kết quả.',
        run: (opts, done) => socket.emit('admin:startBoard', { totalTurns: opts.turns }, done),
        setting: 'turns',
      };
    case 'BOMB_INTRO':
      return {
        label: 'Bắt đầu Quả Bom',
        hint: 'Nhóm đang dẫn đầu cầm quả bom đầu tiên.',
        run: (opts, done) => socket.emit('admin:startBomb', { totalBombs: opts.bombs }, done),
        setting: 'bombs',
      };
    case 'SUMMARY':
      return game.summaryView === 'ranking'
        ? {
            label: 'Hiện tổng kết bài học',
            hint: '6 đặc điểm của nhà nước pháp quyền XHCN Việt Nam.',
            run: (_, done) => socket.emit('admin:setSummaryView', { view: 'lessons' }, done),
          }
        : {
            label: 'Hiện lại bảng xếp hạng',
            hint: 'Buổi chơi đã xong. Muốn chơi lại: dùng "Chơi lại Bàn Cờ" bên dưới.',
            run: (_, done) => socket.emit('admin:setSummaryView', { view: 'ranking' }, done),
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
