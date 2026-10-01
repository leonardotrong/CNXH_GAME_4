import { BOARD_RULES } from './rules';

/** Màn RULES trên máy chiếu: luật tóm tắt có minh họa (GAME_SPEC 5.1). */
export function HostRules() {
  return (
    <section className="host-rules">
      <h1 className="host-rules__title">Bàn Cờ Quyền Lực — Luật chơi</h1>
      <ol className="host-rules__list">
        {BOARD_RULES.map((r) => (
          <li key={r.title}>
            <span className="host-rules__icon" aria-hidden>{r.icon}</span>
            <div>
              <b>{r.title}</b>
              <p>{r.text}</p>
            </div>
          </li>
        ))}
      </ol>
      <p className="host-rules__lesson">Thiểu số phục tùng đa số, bàn bạc dân chủ rồi quyết định tập trung — nguyên tắc <b>tập trung dân chủ</b>.</p>
    </section>
  );
}
