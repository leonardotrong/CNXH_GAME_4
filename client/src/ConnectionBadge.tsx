import { useConnectionStatus, type ConnectionStatus } from './socket';

const LABELS: Record<ConnectionStatus, string> = {
  connecting: 'Đang kết nối…',
  connected: 'Đã kết nối',
  disconnected: 'Mất kết nối',
};

export function ConnectionBadge() {
  const status = useConnectionStatus();
  return (
    <span className={`badge badge--${status}`} role="status">
      {LABELS[status]}
    </span>
  );
}
