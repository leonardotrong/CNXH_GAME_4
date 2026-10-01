import { Icon } from './Icon';
import { BOARD_RULES } from './rules';

/** Màn RULES trên máy chiếu: luật tóm tắt có minh họa (GAME_SPEC 5.1). */
export function HostRules() {
  return (
    <section className="host-rules">
      <header className="host-rules__head">
        <p className="host-rules__kicker">Bàn Cờ Quyền Lực</p>
        <h1 className="host-title">Luật chơi</h1>
      </header>
      <ol className="host-rules__list">
        {BOARD_RULES.map((r, i) => (
          <li key={r.title} className={r.icon === 'bomb' ? 'is-bomb' : ''} style={{ animationDelay: `${i * 0.06}s` }}>
            <Icon name={r.icon} className="host-rules__icon" />
            <div>
              <b className="host-rules__name">{r.title}</b>
              <p>{r.text}</p>
            </div>
          </li>
        ))}
      </ol>
      <p className="host-rules__lesson">
        Thiểu số phục tùng đa số, bàn bạc dân chủ rồi quyết định tập trung — nguyên tắc <b>tập trung dân chủ</b>.
      </p>
    </section>
  );
}
