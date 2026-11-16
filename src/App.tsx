import { useEffect } from 'react';
import { Ceremony } from './components/Ceremony';
import { MatchScreen, PostMatch, PreMatch } from './components/MatchFlow';
import { About, Calendar, ClubSelect, CoinsScreen, History, Hub, Results, SettingsScreen, Stats, TableScreen, Title } from './components/screens';
import { Squad } from './components/Squad';
import { Transfers } from './components/Transfers';
import { Toast } from './components/ui';
import { audio } from './game/audio';
import { boot, go, useApp, type Screen } from './game/store';

const NEED_SAVE: Screen[] = ['hub', 'squad', 'table', 'calendar', 'results', 'transfers', 'coins', 'stats', 'history', 'prematch', 'match', 'post', 'ceremony'];

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
  }
  return <div className={`app ${app.settings.lowGfx ? 'lowgfx' : ''}`}>{view}<Toast /></div>;
}
