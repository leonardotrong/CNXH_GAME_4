import { Icon, type IconName } from '../Icon';
import { Logo } from '../Logo';

const ROLES: { href: string; icon: IconName; title: string; text: string }[] = [
  { href: '/host', icon: 'monitor', title: 'Màn chiếu', text: 'Mở trên máy chiếu: mã QR, bàn cờ, câu hỏi, bảng xếp hạng.' },
  { href: '/play', icon: 'phone', title: 'Người chơi', text: 'Sinh viên quét QR, chọn nhóm và biểu quyết trên điện thoại.' },
  { href: '/admin', icon: 'sliders', title: 'Người dẫn', text: 'Tạo phòng, điều khiển các pha, tạm dừng, chế độ dự phòng.' },
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
            <Icon name={r.icon} className="home-links__icon" />
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
