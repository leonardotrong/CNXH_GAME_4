import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// Phông Be Vietnam Pro tự host (đóng gói trong bản build, không cần mạng ngoài).
import '@fontsource/be-vietnam-pro/400.css';
import '@fontsource/be-vietnam-pro/600.css';
import '@fontsource/be-vietnam-pro/700.css';
import '@fontsource/be-vietnam-pro/800.css';
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
