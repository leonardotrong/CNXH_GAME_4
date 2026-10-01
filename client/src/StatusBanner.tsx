import type { GameView } from '@cnxh/shared';

/** Băng-rôn "TẠM DỪNG" / "Chế độ dự phòng" trên host và điện thoại. */
export function StatusBanner({ game, audience }: { game: GameView | null; audience: 'host' | 'play' }) {
  if (!game) return null;
  return (
    <>
      {game.pausedAt !== null && <div className="status-banner status-banner--paused" role="status">⏸ TẠM DỪNG</div>}
      {game.fallback && (
        <div className="status-banner status-banner--fallback" role="status">
          {audience === 'host' ? 'Chế độ dự phòng — các nhóm giơ thẻ màu A/B/C/D' : 'Chế độ dự phòng — làm theo người dẫn'}
        </div>
      )}
    </>
  );
}
