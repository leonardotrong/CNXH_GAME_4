import type { RoomState, TeamId } from './lobby';

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
  | 'NO_ROOM';

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
}

/** Sự kiện client → server. */
export interface ClientToServerEvents {
  'client:ping': (ack: (serverTime: number) => void) => void;

  'host:watch': (req: { roomCode?: string }, ack: (res: Ack<{ code: string; publicUrl: string | null }>) => void) => void;

  'player:join': (req: JoinRequest, ack: (res: Ack<{ playerId: string; teamId: TeamId }>) => void) => void;
  'player:changeTeam': (req: { teamId: TeamId }, ack: (res: Ack) => void) => void;

  'admin:login': (req: { password: string }, ack: (res: Ack) => void) => void;
  'admin:createRoom': (ack: (res: Ack<{ code: string }>) => void) => void;
  'admin:watch': (req: { roomCode?: string }, ack: (res: Ack<{ code: string }>) => void) => void;
  'admin:setLobbyOpen': (req: { open: boolean }, ack: (res: Ack) => void) => void;
  'admin:setCaptain': (req: { playerId: string }, ack: (res: Ack) => void) => void;
  'admin:movePlayer': (req: { playerId: string; teamId: TeamId }, ack: (res: Ack) => void) => void;
}
