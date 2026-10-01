import { Icon } from './Icon';
import { setMuted, unlockAudio, useSoundState } from './sound';

/** Nút bật/tắt âm thanh trên màn chiếu (GAME_SPEC 5.1). */
export function SoundToggle() {
  const { muted, ready } = useSoundState();
  const label = !ready ? 'Bấm để bật âm thanh' : muted ? 'Đang tắt tiếng' : 'Âm thanh';
  return (
    <button
      className={`sound-toggle ${!ready ? 'is-locked' : ''}`}
      onClick={() => {
        if (!ready) {
          unlockAudio();
          setMuted(false);
        } else setMuted(!muted);
      }}
      title="Bật/tắt âm thanh"
    >
      <Icon name={!ready || muted ? 'mute' : 'volume'} />
      {label}
    </button>
  );
}
