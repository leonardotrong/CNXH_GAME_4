import { Logo } from '../Logo';

const ROLES = [
  { href: '/host', icon: '📽️', title: 'Màn chiếu', text: 'Mở trên máy chiếu: mã QR, bàn cờ, câu hỏi, bảng xếp hạng.' },
  { href: '/play', icon: '📱', title: 'Người chơi', text: 'Sinh viên quét QR, chọn nhóm và biểu quyết trên điện thoại.' },
  { href: '/admin', icon: '🎛️', title: 'Người dẫn', text: 'Tạo phòng, điều khiển các pha, tạm dừng, chế độ dự phòng.' },
];

export function HomePage() {
  return (
    <main className="page page--home">
      <header className="home-hero">
        <Logo className="home-hero__logo" />
        <h1>
          Bàn Cờ Quyền Lực <span>&amp; Quả Bom Tham Nhũng</span>
        </h1>
        <p>Trò chơi lớp Chủ nghĩa xã hội khoa học — nhà nước pháp quyền XHCN Việt Nam</p>
      </header>
      <nav className="home-links">
        {ROLES.map((r) => (
          <a key={r.href} href={r.href}>
            <span className="home-links__icon" aria-hidden>
              {r.icon}
            </span>
            <span>
              <b>{r.title}</b>
              <small>{r.text}</small>
            </span>
            <span className="home-links__path">{r.href}</span>
          </a>
        ))}
      </nav>
    </main>
  );
}
