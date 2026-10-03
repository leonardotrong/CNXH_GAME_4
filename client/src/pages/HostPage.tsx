import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { ConnectionBadge } from '../ConnectionBadge';
import { HostGame } from '../HostGame';
import { HostRemote } from '../HostRemote';
import { HostRules } from '../HostRules';
import { Icon } from '../Icon';
import { Logo } from '../Logo';
import { SoundToggle } from '../SoundToggle';
import { StatusBanner } from '../StatusBanner';
import { unlockAudio } from '../sound';
import { useHostSounds } from '../useHostSounds';
import { QuestionPanel } from '../QuestionPanel';
import { socket, useConnectionStatus, useGame, useQuestion, useRoomState } from '../socket';
import { teamName, teamStyle } from '../teams';

export function HostPage() {
  const status = useConnectionStatus();
  const state = useRoomState();
  const question = useQuestion();
  const game = useGame();
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
    QRCode.toString(joinUrl, { type: 'svg', margin: 1, width: 400, color: { dark: '#0a0f26', light: '#ffffff' } }).then(setQrSvg);
  }, [joinUrl]);

  useHostSounds(game, question);
  const chrome = (
    <>
      <ConnectionBadge />
      <SoundToggle />
      <StatusBanner game={game} audience="host" />
      <HostRemote hasRoom={!!state} game={game} question={question} />
    </>
  );

  const activeTeamIds = state?.teams.filter((t) => t.players.length > 0).map((t) => t.id) ?? [];

  // Trong trận: màn Bàn Cờ. Câu thử (chỉ mở được ở LOBBY/SUMMARY) vẫn hiện như Giai đoạn 2.
  if (state && game?.board && game.phase !== 'LOBBY' && !(game.phase === 'SUMMARY' && question)) {
    return (
      <main className={`page page--host page--game ${game.phase.startsWith('BOMB_') ? 'page--danger' : ''}`} onPointerDown={unlockAudio}>
        {chrome}
        {/* key theo pha: mỗi pha dựng lại màn hình → hiệu ứng chuyển cảnh (CSS .host-game). */}
        <HostGame key={`${game.phase}-${game.summaryView}`} game={game} question={question} activeTeamIds={activeTeamIds} />
      </main>
    );
  }

  const players = state?.teams.reduce((n, t) => n + t.players.length, 0) ?? 0;
  const shortUrl = joinUrl.replace(/^https?:\/\//, '').replace(/\?.*/, '');

  return (
    <main className="page page--host" onPointerDown={unlockAudio}>
      {chrome}
      {game?.phase === 'RULES' && !question ? (
        <HostRules key="rules" />
      ) : question ? (
        <div className="host-solo">
          <QuestionPanel view={question} activeTeamIds={activeTeamIds} />
        </div>
      ) : !state ? (
        <section className="host-waiting">
          <Logo className="host-waiting__logo" />
          <h1 className="host-title">Bàn Cờ Quyền Lực</h1>
          <p className="host-waiting__note">
            {status === 'connected' ? 'Đang chờ người dẫn tạo phòng' : 'Đang kết nối tới máy chủ'}
            <span className="dots" aria-hidden>
              <i />
              <i />
              <i />
            </span>
          </p>
        </section>
      ) : (
        <div className="host-lobby">
          <header className="host-lobby__brand">
            <Logo className="host-lobby__logo" />
            <span>Bàn Cờ Quyền Lực &amp; Quả Bom Tham Nhũng</span>
          </header>
          <section className="host-join">
            <div className="host-join__qr" dangerouslySetInnerHTML={{ __html: qrSvg }} />
            <div className="host-join__info">
              <p className="host-join__label">Quét mã QR hoặc vào</p>
              <p className="host-join__url">{shortUrl}</p>
              <p className="host-join__label">Mã phòng</p>
              <p className="host-join__code">{state.code}</p>
              <p className="host-join__count">
                <Icon name="users" /> {players} người đã vào
                {!state.lobbyOpen && <span className="host-join__closed">· đã đóng cổng vào phòng</span>}
              </p>
            </div>
          </section>
          <section className="host-teams">
            {state.teams.map((t) => (
              <div key={t.id} className={`host-team ${t.players.length === 0 ? 'is-empty' : ''}`} style={teamStyle(t.id)}>
                <h2>
                  <span>{teamName(t.id)}</span>
                  <span className="host-team__count">{t.players.length}</span>
                </h2>
                <ul>
                  {/* Đội trưởng (người dẫn đặt theo danh sách nhóm trưởng, hoặc người vào đầu) đứng đầu cột. */}
                  {[...t.players]
                    .sort((a, b) => Number(b.isDesignatedCaptain) - Number(a.isDesignatedCaptain))
                    .map((p) => (
                      <li key={p.id} className={p.online ? '' : 'is-offline'}>
                        {p.isDesignatedCaptain && (
                          <span className="captain-star" title="Đội trưởng">
                            ★{' '}
                          </span>
                        )}
                        {p.name}
                      </li>
                    ))}
                </ul>
              </div>
            ))}
          </section>
        </div>
      )}
    </main>
  );
}
