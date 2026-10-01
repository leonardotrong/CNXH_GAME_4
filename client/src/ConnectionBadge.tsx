import { useConnectionStatus, type ConnectionStatus } from './socket';

const LABELS: Record<ConnectionStatus, string> = {
  connecting: 'Đang kết nối…',
  connected: 'Đã kết nối',
  disconnected: 'Mất kết nối',
};

/** Chấm trạng thái kết nối; chữ chỉ nổi bật khi có sự cố. */
export function ConnectionBadge() {
  const status = useConnectionStatus();
  return (
    <span className={`conn conn--${status}`} role="status">
      <i aria-hidden />
      <span className="conn__label">{LABELS[status]}</span>
    </span>
  );
}
