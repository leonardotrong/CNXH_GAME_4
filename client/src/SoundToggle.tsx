import { Icon } from './Icon';
import { setMuted, unlockAudio, useSoundState } from './sound';

/** Nút bật/tắt âm thanh trên màn chiếu (GAME_SPEC 5.1). */
export function SoundToggle() {
  const { muted, ready } = useSoundState();
  // Đã bật: chỉ còn icon nhỏ ở góc để không che nội dung. Chưa bật: nhắc một lần (bấm/chạm/gõ phím bất kỳ là bật).
  const label = !ready ? 'Bấm để bật âm thanh' : null;
  return (
    <button
      className={`sound-toggle ${!ready ? 'is-locked' : ''}`}
      onClick={() => {
        if (!ready) {
          unlockAudio();
          setMuted(false);
        } else setMuted(!muted);
      }}
      title={muted ? 'Đang tắt tiếng — bấm để bật (phím M)' : 'Tắt âm thanh (phím M)'}
      aria-label={muted ? 'Bật âm thanh' : 'Tắt âm thanh'}
    >
      <Icon name={!ready || muted ? 'mute' : 'volume'} />
      {label}
    </button>
  );
}
