import { AdminPage } from './pages/AdminPage';
import { HomePage } from './pages/HomePage';
import { HostPage } from './pages/HostPage';
import { PlayPage } from './pages/PlayPage';

export function App() {
  const pathname = window.location.pathname.replace(/\/+$/, '');
  switch (pathname) {
    case '/host':
      return <HostPage />;
    case '/play':
      return <PlayPage />;
    case '/admin':
      return <AdminPage />;
    default:
      return <HomePage />;
  }
}
