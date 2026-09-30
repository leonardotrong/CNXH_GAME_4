/** Vai trò của một kết nối, tương ứng với route trên client. */
export type ClientRole = 'host' | 'play' | 'admin';

export interface HelloPayload {
  /** Thời điểm server gửi (ms, Date.now() của server). */
  serverTime: number;
}

/** Sự kiện server → client. */
export interface ServerToClientEvents {
  'server:hello': (payload: HelloPayload) => void;
}

/** Sự kiện client → server. */
export interface ClientToServerEvents {
  'client:ping': (ack: (serverTime: number) => void) => void;
}
