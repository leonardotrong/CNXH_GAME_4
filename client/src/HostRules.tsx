import { Logo } from './Logo';
import { BOARD_RULES } from './rules';

/** Màn RULES trên máy chiếu: luật tóm tắt có minh họa (GAME_SPEC 5.1). */
export function HostRules() {
  return (
    <section className="host-rules">
      <header className="host-rules__head">
        <Logo className="host-rules__logo" />
        <h1 className="host-title">
          Luật chơi <span>Bàn Cờ Quyền Lực</span>
        </h1>
      </header>
      <ol className="host-rules__list">
        {BOARD_RULES.map((r, i) => (
          <li key={r.title} style={{ animationDelay: `${i * 0.08}s` }}>
            <span className="host-rules__icon" aria-hidden>
              {r.icon}
            </span>
            <b className="host-rules__name">{r.title}</b>
            <p>{r.text}</p>
          </li>
        ))}
      </ol>
      <p className="host-rules__lesson">
        <span aria-hidden>⚖️</span>
        <span>
          Thiểu số phục tùng đa số, bàn bạc dân chủ rồi quyết định tập trung — nguyên tắc <b>tập trung dân chủ</b>.
        </span>
      </p>
    </section>
  );
}
