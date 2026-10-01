import { Logo } from './Logo';
import { GAME_LESSONS, SIX_FEATURES } from './lessons';

/** Tổng kết: 6 đặc điểm của nhà nước pháp quyền XHCN Việt Nam (GAME_SPEC 5.1 SUMMARY). */
export function HostLessons() {
  return (
    <section className="host-lessons">
      <header className="host-lessons__head">
        <Logo className="host-lessons__logo" />
        <h1 className="host-title">
          6 đặc điểm <span>của Nhà nước pháp quyền XHCN Việt Nam</span>
        </h1>
      </header>
      <ol className="host-lessons__grid">
        {SIX_FEATURES.map((f, i) => (
          <li key={f.title} style={{ animationDelay: `${i * 0.35}s` }}>
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
            <span>{l.game}</span>
            <span className="host-lessons__arrow" aria-hidden>
              →
            </span>
            <b>{l.lesson}</b>
          </li>
        ))}
      </ul>
    </section>
  );
}
