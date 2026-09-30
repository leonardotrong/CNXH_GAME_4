import type { GameView } from './boardMatch';
import type { RoomState, TeamId } from './lobby';
import type { PublicQuestionView, TeamQuestionView } from './questionRound';
import type { RoundError } from './voteRound';
import type { QuestionPool } from './questions';
import type { TeamSelectView } from './selectRound';

/** Vai trò của một kết nối, tương ứng với route trên client. */
export type ClientRole = 'host' | 'play' | 'admin';

export interface HelloPayload {
  /** Thời điểm server gửi (ms, Date.now() của server). */
  serverTime: number;
}

export type ErrorCode =
  | 'BAD_REQUEST'
  | 'UNAUTHORIZED'
  | 'ROOM_NOT_FOUND'
  | 'LOBBY_CLOSED'
  | 'PLAYER_NOT_FOUND'
  | 'NO_ROOM'
  | 'NO_QUESTION'
  | 'QUESTION_ACTIVE'
  | 'NO_QUESTIONS_IN_POOL'
  | 'WRONG_PHASE'
  | RoundError;

export type Ack<T = object> = ({ ok: true } & T) | { ok: false; error: ErrorCode };

export interface JoinRequest {
  roomCode: string;
  /** Có khi vào lại: giữ nguyên nhóm và vai trò. */
  playerId?: string;
  /** Bắt buộc khi vào lần đầu. */
  name?: string;
  teamId?: TeamId;
}

/** Sự kiện server → client. */
export interface ServerToClientEvents {
  'server:hello': (payload: HelloPayload) => void;
  'room:state': (state: RoomState) => void;
  /** Gửi tới các host đang chờ khi admin tạo phòng mới. */
  'room:created': (payload: { code: string }) => void;
  /** Câu hỏi hiện tại (null = không có). Khi còn mở: không có đáp án/giải thích/lựa chọn của nhóm. */
  'question:state': (view: PublicQuestionView | null) => void;
  /** Phiếu của nhóm mình — chỉ gửi cho thành viên nhóm đó. */
  'question:team': (view: TeamQuestionView | null) => void;
  /** Pha hiện tại + bàn cờ (công khai; mục tiêu chỉ có sau khi SELECT đóng). */
  'game:state': (view: GameView) => void;
  /** Phiếu chọn ô của nhóm mình + ô hợp lệ — chỉ gửi cho thành viên nhóm đó. */
  'select:team': (view: TeamSelectView | null) => void;
}

/** Sự kiện client → server. */
export interface ClientToServerEvents {
  'client:ping': (ack: (serverTime: number) => void) => void;

  'host:watch': (req: { roomCode?: string }, ack: (res: Ack<{ code: string; publicUrl: string | null }>) => void) => void;

  'player:join': (req: JoinRequest, ack: (res: Ack<{ playerId: string; teamId: TeamId }>) => void) => void;
  'player:changeTeam': (req: { teamId: TeamId }, ack: (res: Ack) => void) => void;
  /** Bỏ phiếu cho vòng đang mở (câu hỏi: chỉ số phương án; SELECT: id ô). */
  'player:vote': (req: { roundId: number; option: number }, ack: (res: Ack) => void) => void;
  /** Lệnh CHỐT của đội trưởng. */
  'player:lock': (req: { roundId: number }, ack: (res: Ack) => void) => void;

  'admin:login': (req: { password: string }, ack: (res: Ack) => void) => void;
  'admin:createRoom': (ack: (res: Ack<{ code: string }>) => void) => void;
  'admin:watch': (req: { roomCode?: string }, ack: (res: Ack<{ code: string }>) => void) => void;
  'admin:setLobbyOpen': (req: { open: boolean }, ack: (res: Ack) => void) => void;
  'admin:setCaptain': (req: { playerId: string }, ack: (res: Ack) => void) => void;
  /** "Câu thử": hỏi một câu cho cả 7 nhóm. */
  'admin:startQuestion': (req: { pool: QuestionPool }, ack: (res: Ack<{ roundId: number }>) => void) => void;
  /** Bắt đầu Bàn Cờ Quyền Lực (từ LOBBY hoặc SUMMARY). */
  'admin:startBoard': (req: { totalTurns?: number }, ack: (res: Ack) => void) => void;
  /** Chỉnh số lượt N khi đang chơi (không nhỏ hơn lượt hiện tại). */
  'admin:setBoardTurns': (req: { totalTurns: number }, ack: (res: Ack<{ totalTurns: number }>) => void) => void;
  /** "Kết thúc sau lượt này" (bật/tắt). */
  'admin:endBoardAfterTurn': (req: { value: boolean }, ack: (res: Ack) => void) => void;
  /** Bỏ qua câu lỗi: câu thử → hủy; câu Bàn Cờ → thay bằng câu khác, giữ nguyên mục tiêu. */
  'admin:skipQuestion': (ack: (res: Ack) => void) => void;
  'admin:movePlayer': (req: { playerId: string; teamId: TeamId }, ack: (res: Ack) => void) => void;
}
