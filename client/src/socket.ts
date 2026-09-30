import { useEffect, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import type {
  ClientToServerEvents,
  PublicQuestionView,
  RoomState,
  ServerToClientEvents,
  TeamQuestionView,
} from '@cnxh/shared';

export type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;
export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected';

// Một kết nối duy nhất cho cả trang; cùng origin (dev: Vite proxy, production: server phục vụ client).
export const socket: GameSocket = io({ autoConnect: false });

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
