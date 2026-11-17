// Шрифти підключені локально (без звернень до зовнішніх сервісів)
import '@fontsource/sofia-sans-extra-condensed/cyrillic-800-italic.css';
import '@fontsource/sofia-sans-extra-condensed/cyrillic-900-italic.css';
import '@fontsource/sofia-sans-extra-condensed/latin-800-italic.css';
import '@fontsource/sofia-sans-extra-condensed/latin-900-italic.css';
import '@fontsource/tektur/cyrillic-700.css';
import '@fontsource/tektur/latin-700.css';
import '@fontsource/golos-text/cyrillic-400.css';
import '@fontsource/golos-text/cyrillic-600.css';
import '@fontsource/golos-text/latin-400.css';
import '@fontsource/golos-text/latin-600.css';
import './styles/tokens.css';
import './styles/app.css';
import './styles/cards.css';
import './styles/arcade.css';
import './styles/kit.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);

// Service Worker: кешування ресурсів та офлайн-доступ (лише у зібраній версії).
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('./sw.js').catch(() => undefined); });
}
