import type { GameView, SummaryView } from './boardMatch';
import type { FallbackAnswer } from './fallback';
import type { TeamPassView } from './bomb';
import type { RoomState, TeamId } from './lobby';
import type { PublicQuestionView, TeamQuestionView } from './questionRound';
import type { RoundError } from './voteRound';
import type { QuestionPool } from './questions';
import type { TeamSelectView } from './selectRound';

/** Một dòng nhật ký sự kiện — chỉ gửi cho admin (GAME_SPEC 5.3). Không bao giờ chứa ngòi bom. */
export interface LogEntry {
  id: number;
  /** Giờ server (ms). */
  at: number;
  kind: 'phase' | 'turn' | 'bomb' | 'admin' | 'system';
  text: string;
}

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
  | 'PAUSED'
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
  /** Phiếu chọn nhóm nhận bom — chỉ gửi cho thành viên nhóm đang cầm bom (null với nhóm khác). */
  'pass:team': (view: TeamPassView | null) => void;
  /** Nhật ký sự kiện — chỉ gửi cho admin đã đăng nhập. */
  'admin:log': (entries: LogEntry[]) => void;
}

/** Sự kiện client → server. */
export interface ClientToServerEvents {
  'client:ping': (ack: (serverTime: number) => void) => void;

  'host:watch': (req: { roomCode?: string }, ack: (res: Ack<{ code: string; publicUrl: string | null }>) => void) => void;

  'player:join': (req: JoinRequest, ack: (res: Ack<{ playerId: string; teamId: TeamId }>) => void) => void;
  'player:changeTeam': (req: { teamId: TeamId }, ack: (res: Ack) => void) => void;
  /** Bỏ phiếu cho vòng đang mở (câu hỏi: chỉ số phương án; SELECT: id ô; PASS: số nhóm nhận bom). */
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
  /** Bắt đầu Quả Bom Tham Nhũng (từ BOMB_INTRO), số bom 1–5. */
  'admin:startBomb': (req: { totalBombs?: number }, ack: (res: Ack) => void) => void;
  /** Bỏ qua câu lỗi: câu thử → hủy; câu Bàn Cờ → thay câu khác, giữ nguyên mục tiêu; câu bom → thay câu khác, ngòi cháy tiếp. */
  'admin:skipQuestion': (ack: (res: Ack) => void) => void;
  'admin:movePlayer': (req: { playerId: string; teamId: TeamId }, ack: (res: Ack) => void) => void;
  /** LOBBY/SUMMARY → RULES (host hiện luật tóm tắt). */
  'admin:showRules': (ack: (res: Ack) => void) => void;
  /** Tạm dừng/tiếp tục toàn cục. */
  'admin:setPaused': (req: { paused: boolean }, ack: (res: Ack) => void) => void;
  /** Chỉnh tay chủ một ô (null = ô trống). */
  'admin:setCellOwner': (req: { cellId: number; owner: TeamId | null }, ack: (res: Ack) => void) => void;
  /** SUMMARY: bảng xếp hạng hoặc màn tổng kết 6 đặc điểm. */
  'admin:setSummaryView': (req: { view: SummaryView }, ack: (res: Ack) => void) => void;
  /** Bật/tắt chế độ dự phòng. */
  'admin:setFallback': (req: { on: boolean }, ack: (res: Ack) => void) => void;
  /** Dự phòng — SELECT: ô mục tiêu của các nhóm (null = bỏ lượt), rồi đóng SELECT. */
  'admin:fallbackSelect': (req: { targets: Record<number, number | null> }, ack: (res: Ack) => void) => void;
  /** Dự phòng — câu hỏi đang mở: đáp án + hạng nhanh chậm của các nhóm, rồi đóng câu. */
  'admin:fallbackAnswers': (req: { answers: FallbackAnswer[] }, ack: (res: Ack) => void) => void;
  /** Dự phòng — PASS: nhóm nhận bom. */
  'admin:fallbackPass': (req: { to: TeamId }, ack: (res: Ack) => void) => void;
}
