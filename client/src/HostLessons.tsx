import { GAME_LESSONS, SIX_FEATURES } from './lessons';

/** Tổng kết: 6 đặc điểm của nhà nước pháp quyền XHCN Việt Nam (GAME_SPEC 5.1 SUMMARY). */
export function HostLessons() {
  return (
    <section className="host-lessons">
      <header className="host-lessons__head">
        <p className="host-rules__kicker">Tổng kết</p>
        <h1 className="host-title">6 đặc điểm của Nhà nước pháp quyền XHCN Việt Nam</h1>
      </header>
      <ol className="host-lessons__grid">
        {SIX_FEATURES.map((f, i) => (
          <li key={f.title} style={{ animationDelay: `${i * 0.3}s` }}>
            <span className="host-lessons__num">{i + 1}</span>
            <div>
              <b>{f.title}</b>
              <p>{f.text}</p>
            </div>
          </li>
        ))}
      </ol>
      <ul className="host-lessons__map">
        {GAME_LESSONS.map((l) => (
          <li key={l.game}>
            {l.game} → <b>{l.lesson}</b>
          </li>
        ))}
      </ul>
    </section>
  );
}
