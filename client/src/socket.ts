import { useEffect, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import type {
  ClientToServerEvents,
  GameView,
  LogEntry,
  PublicQuestionView,
  RoomState,
  ServerToClientEvents,
  TeamPassView,
  TeamQuestionView,
  TeamSelectView,
} from '@cnxh/shared';

export type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;
export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected';

// Một kết nối duy nhất cho cả trang; cùng origin (dev: Vite proxy, production: server phục vụ client).
export const socket: GameSocket = io({ autoConnect: false });

/** Hạn chờ server trả lời một lệnh. */
export const ACK_TIMEOUT_MS = 5000;

/**
 * Callback cho `socket.timeout(ACK_TIMEOUT_MS).emit(...)`: mất kết nối hoặc quá hạn → `{ ok: false, error: 'NETWORK' }`.
 * Ack thường bị Socket.IO bỏ im lặng nếu rớt mạng trước khi server trả lời — giao diện đang chờ kết quả
 * (phiếu vừa chạm, nút "Bước tiếp theo" đang bận) sẽ kẹt mãi.
 */
export function orNetworkError<R>(done: (res: R | { ok: false; error: 'NETWORK' }) => void): (err: Error | null, res: R) => void {
  return (err, res) => done(err ? { ok: false, error: 'NETWORK' } : res);
}

export function useConnectionStatus(): ConnectionStatus {
  const [status, setStatus] = useState<ConnectionStatus>(socket.connected ? 'connected' : 'connecting');

  useEffect(() => {
    const onConnect = () => setStatus('connected');
    const onDisconnect = () => setStatus('disconnected');
    const onReconnectAttempt = () => setStatus('connecting');

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.io.on('reconnect_attempt', onReconnectAttempt);
    if (!socket.connected) socket.connect();

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.io.off('reconnect_attempt', onReconnectAttempt);
    };
  }, []);

  return status;
}

/** Theo dõi trạng thái phòng do server đẩy xuống. */
export function useRoomState(): RoomState | null {
  const [state, setState] = useState<RoomState | null>(null);
  useEffect(() => {
    socket.on('room:state', setState);
    return () => {
      socket.off('room:state', setState);
    };
  }, []);
  return state;
}

/** Câu hỏi hiện tại (dữ liệu công khai). */
export function useQuestion(): PublicQuestionView | null {
  const [view, setView] = useState<PublicQuestionView | null>(null);
  useEffect(() => {
    socket.on('question:state', setView);
    return () => {
      socket.off('question:state', setView);
    };
  }, []);
  return view;
}

/** Phiếu của nhóm mình (chỉ /play nhận). */
export function useTeamVotes(): TeamQuestionView | null {
  const [view, setView] = useState<TeamQuestionView | null>(null);
  useEffect(() => {
    socket.on('question:team', setView);
    return () => {
      socket.off('question:team', setView);
    };
  }, []);
  return view;
}

/** Pha hiện tại + bàn cờ công khai. */
export function useGame(): GameView | null {
  const [view, setView] = useState<GameView | null>(null);
  useEffect(() => {
    socket.on('game:state', setView);
    return () => {
      socket.off('game:state', setView);
    };
  }, []);
  return view;
}

/** Phiếu chọn ô của nhóm mình (chỉ /play nhận). */
export function useTeamSelect(): TeamSelectView | null {
  const [view, setView] = useState<TeamSelectView | null>(null);
  useEffect(() => {
    socket.on('select:team', setView);
    return () => {
      socket.off('select:team', setView);
    };
  }, []);
  return view;
}

/** Phiếu chọn nhóm nhận bom của nhóm mình (chỉ nhóm đang cầm bom nhận được giá trị khác null). */
export function useTeamPass(): TeamPassView | null {
  const [view, setView] = useState<TeamPassView | null>(null);
  useEffect(() => {
    socket.on('pass:team', setView);
    return () => {
      socket.off('pass:team', setView);
    };
  }, []);
  return view;
}

/** Nhật ký sự kiện (chỉ admin nhận). */
export function useAdminLog(): LogEntry[] {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  useEffect(() => {
    socket.on('admin:log', setEntries);
    return () => {
      socket.off('admin:log', setEntries);
    };
  }, []);
  return entries;
}
