import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// Phông Nunito (bo tròn, kiểu game) tự host — một file biến thiên cho mọi độ đậm, không cần mạng ngoài.
import '@fontsource-variable/nunito';
import { App } from './App';
import './styles/base.css';
import './styles/components.css';
import './styles/board.css';
import './styles/host.css';
import './styles/play.css';
import './styles/admin.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
