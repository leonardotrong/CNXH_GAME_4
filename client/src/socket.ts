import { useEffect, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@cnxh/shared';

export type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents>;
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
