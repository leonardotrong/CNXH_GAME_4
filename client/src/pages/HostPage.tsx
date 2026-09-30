import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { ConnectionBadge } from '../ConnectionBadge';
import { socket, useConnectionStatus, useRoomState } from '../socket';
import { TEAM_COLORS, teamName } from '../teams';

export function HostPage() {
  const status = useConnectionStatus();
  const state = useRoomState();
  const [publicUrl, setPublicUrl] = useState<string | null>(null);
  const [qrSvg, setQrSvg] = useState('');

  // Theo dõi phòng mới nhất; khi admin tạo phòng thì theo dõi phòng đó.
  useEffect(() => {
    const roomFromUrl = new URLSearchParams(window.location.search).get('room') ?? undefined;
    const watch = (roomCode?: string) =>
      socket.emit('host:watch', { roomCode }, (res) => {
        if (res.ok) setPublicUrl(res.publicUrl);
      });
    const onCreated = ({ code }: { code: string }) => watch(code);
    const onConnect = () => watch(roomFromUrl);
    socket.on('room:created', onCreated);
    socket.on('connect', onConnect);
    if (socket.connected) onConnect();
    return () => {
      socket.off('room:created', onCreated);
      socket.off('connect', onConnect);
    };
  }, []);

  const joinUrl = state ? `${(publicUrl ?? window.location.origin).replace(/\/$/, '')}/play?room=${state.code}` : '';
  useEffect(() => {
    if (!joinUrl) return;
    QRCode.toString(joinUrl, { type: 'svg', margin: 1, width: 400 }).then(setQrSvg);
  }, [joinUrl]);

  return (
    <main className="page page--host">
      <ConnectionBadge />
      {!state ? (
        <h1>{status === 'connected' ? 'Đang chờ người dẫn tạo phòng…' : 'Bàn Cờ Quyền Lực — Màn chiếu'}</h1>
      ) : (
        <>
          <section className="host-join">
            <div className="host-join__qr" dangerouslySetInnerHTML={{ __html: qrSvg }} />
            <div>
              <p>Quét mã QR hoặc vào</p>
              <p className="host-join__url">{joinUrl.replace(/^https?:\/\//, '').replace(/\?.*/, '')}</p>
              <p>Mã phòng</p>
              <p className="host-join__code">{state.code}</p>
              {!state.lobbyOpen && <p className="host-join__closed">Đã đóng cổng vào phòng</p>}
            </div>
          </section>
          <section className="host-teams">
            {state.teams.map((t) => (
              <div key={t.id} className="host-team" style={{ borderColor: TEAM_COLORS[t.id] }}>
                <h2 style={{ background: TEAM_COLORS[t.id] }}>
                  {teamName(t.id)} <span>({t.players.length})</span>
                </h2>
                <ul>
                  {t.players.map((p) => (
                    <li key={p.id} className={p.online ? '' : 'is-offline'}>
                      {p.isCaptain && <span title="Đội trưởng">★ </span>}
                      {p.name}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </section>
        </>
      )}
    </main>
  );
}
