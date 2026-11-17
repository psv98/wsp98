import { Component, Suspense, lazy, useEffect, type ComponentType, type ReactNode } from 'react';
import { About, Calendar, ClubSelect, CoinsScreen, History, Hub, Results, SettingsScreen, Stats, TableScreen, Title } from './components/screens';
import { Squad } from './components/Squad';
import { Transfers } from './components/Transfers';
import { Toast } from './components/ui';
import { audio } from './game/audio';
import { boot, go, useApp, type Screen } from './game/store';

/**
 * Відкладене завантаження екрана. Якщо після нового релізу старий файл уже недоступний,
 * сторінка один раз перезавантажується й отримує свіжу версію гри (прогрес зберігається в IndexedDB).
 */
function lazyScreen<T extends ComponentType>(load: () => Promise<{ default: T }>) {
  return lazy(() => load().then((m) => { try { sessionStorage.removeItem('bsk-reload'); } catch { /* немає сховища */ } return m; }).catch((e) => {
    let tried = false;
    try { tried = sessionStorage.getItem('bsk-reload') === '1'; sessionStorage.setItem('bsk-reload', '1'); } catch { /* немає сховища */ }
    if (!tried) { try { sessionStorage.setItem('bsk-resume', '1'); } catch { /* немає сховища */ } window.location.reload(); return new Promise<{ default: T }>(() => undefined); }
    throw e;
  }));
}

/** Запобіжник: замість порожнього екрана — зрозуміле повідомлення й кнопка перезавантаження. */
class ScreenGuard extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(e: unknown) { console.error(e); }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="title"><div className="title-inner">
        <h2>Гру оновлено</h2>
        <p className="muted" style={{ maxWidth: 420 }}>Вийшла нова версія «Білого суперкубка». Перезавантажте сторінку — ваш прогрес збережено.</p>
        <button type="button" className="btn primary big" onClick={() => { try { sessionStorage.removeItem('bsk-reload'); } catch { /* немає сховища */ } window.location.reload(); }}>Перезавантажити</button>
      </div></div>
    );
  }
}

// Важкі екрани (матч, підсумки, церемонія) завантажуються лише коли потрібні
const MatchScreen = lazyScreen(() => import('./components/MatchFlow').then((m) => ({ default: m.MatchScreen })));
const PreMatch = lazyScreen(() => import('./components/MatchFlow').then((m) => ({ default: m.PreMatch })));
const PostMatch = lazyScreen(() => import('./components/MatchFlow').then((m) => ({ default: m.PostMatch })));
const Offseason = lazyScreen(() => import('./components/Offseason').then((m) => ({ default: m.Offseason })));
const Ceremony = lazyScreen(() => import('./components/Ceremony').then((m) => ({ default: m.Ceremony })));

const NEED_SAVE: Screen[] = ['hub', 'squad', 'table', 'calendar', 'results', 'transfers', 'coins', 'stats', 'history', 'prematch', 'match', 'post', 'ceremony', 'offseason'];

export function App() {
  const app = useApp();
  useEffect(() => { void boot(); }, []);
  useEffect(() => {
    const unlock = () => audio.unlock();
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    return () => { window.removeEventListener('pointerdown', unlock); window.removeEventListener('keydown', unlock); };
  }, []);
  useEffect(() => {
    if (app.screen === 'title' || app.screen === 'select' || app.screen === 'about') audio.music('menu');
    else if (app.screen === 'match' || app.screen === 'prematch' || app.screen === 'post') audio.music(null);
    else if (app.screen !== 'ceremony') audio.music('menu');
  }, [app.screen]);
  useEffect(() => { if (app.loaded && !app.save && NEED_SAVE.includes(app.screen)) go('title'); }, [app.loaded, app.save, app.screen]);

  let view: React.ReactNode;
  if (!app.loaded) view = <div className="title"><div className="title-inner"><p className="muted">Завантаження…</p></div></div>;
  else if (!app.save && NEED_SAVE.includes(app.screen)) view = null;
  else switch (app.screen) {
    case 'title': view = <Title />; break;
    case 'select': view = <ClubSelect />; break;
    case 'hub': view = <Hub />; break;
    case 'squad': view = <Squad />; break;
    case 'table': view = <TableScreen />; break;
    case 'calendar': view = <Calendar />; break;
    case 'results': view = <Results />; break;
    case 'transfers': view = <Transfers />; break;
    case 'coins': view = <CoinsScreen />; break;
    case 'stats': view = <Stats />; break;
    case 'history': view = <History />; break;
    case 'settings': view = <SettingsScreen />; break;
    case 'about': view = <About />; break;
    case 'prematch': view = <PreMatch />; break;
    case 'match': view = <MatchScreen />; break;
    case 'post': view = <PostMatch />; break;
    case 'ceremony': view = <Ceremony />; break;
    case 'offseason': view = <Offseason />; break;
  }
  return <div className={`app ${app.settings.lowGfx ? 'lowgfx' : ''}`}><ScreenGuard><Suspense fallback={<div className="page muted center">Завантаження…</div>}>{view}</Suspense></ScreenGuard><Toast /></div>;
}
