import './styles/fonts.css';
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
