import type { LogEntry } from '@cnxh/shared';

const KIND_LABEL: Record<LogEntry['kind'], string> = {
  phase: 'Pha',
  turn: 'Bàn Cờ',
  bomb: 'Bom',
  admin: 'Admin',
  system: 'Hệ thống',
};

function time(at: number): string {
  return new Date(at).toLocaleTimeString('vi-VN', { hour12: false });
}

/** Nhật ký sự kiện để giải quyết tranh cãi (GAME_SPEC 5.3) — mới nhất ở trên. */
export function AdminLog({ entries }: { entries: LogEntry[] }) {
  return (
    <section className="admin-card admin-log">
      <h2>
        Nhật ký sự kiện <span className="admin-count">{entries.length}</span>
      </h2>
      {entries.length === 0 ? (
        <p className="admin-muted">Chưa có sự kiện.</p>
      ) : (
        <ol>
          {[...entries].reverse().map((e) => (
            <li key={e.id} className={`admin-log__item is-${e.kind}`}>
              <time>{time(e.at)}</time>
              <span className="admin-log__kind">{KIND_LABEL[e.kind]}</span>
              <span>{e.text}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
