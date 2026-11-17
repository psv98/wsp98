// Глобальний стан застосунку: збереження, налаштування, поточний екран. Кожна зміна стану автоматично зберігається.
import { useSyncExternalStore } from 'react';
import { clearGame, exportSave, importSave, loadBackup, loadGame, loadSettings, saveGame, saveSettings } from '../storage/db';
import { GameError } from '../systems/actions';
import { DevError } from '../systems/development';
import { MarketError } from '../systems/market';
import { newGame, nextSeason, ROUNDS } from '../systems/season';
import { DEFAULT_SETTINGS, type SaveState, type Settings } from '../systems/types';
import { audio } from './audio';

export type Screen = 'title' | 'select' | 'hub' | 'squad' | 'table' | 'calendar' | 'results' | 'transfers' | 'coins' | 'stats' | 'history' | 'settings' | 'about' | 'prematch' | 'match' | 'post' | 'ceremony' | 'offseason';

export interface AppState {
  loaded: boolean;
  save: SaveState | null;
  settings: Settings;
  screen: Screen;
  back: Screen;
  toast: { text: string; kind: 'ok' | 'err' } | null;
  recovered: boolean;
  saveFailed: boolean;
}

let state: AppState = { loaded: false, save: null, settings: DEFAULT_SETTINGS, screen: 'title', back: 'title', toast: null, recovered: false, saveFailed: false };
const subs = new Set<() => void>();
const set = (patch: Partial<AppState>) => { state = { ...state, ...patch }; subs.forEach((f) => f()); };

export const getState = () => state;
export function useApp(): AppState {
  return useSyncExternalStore((cb) => { subs.add(cb); return () => subs.delete(cb); }, () => state);
}

let toastTimer: number | undefined;
export function toast(text: string, kind: 'ok' | 'err' = 'ok') {
  set({ toast: { text, kind } });
  if (kind === 'err') audio.sfx('error');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => set({ toast: null }), 3200);
}

let chain: Promise<unknown> = Promise.resolve();
/** Фіксує новий стан гри та записує його у сховище (записи виконуються строго по черзі). */
export function commit(save: SaveState, opts: { seasonStart?: boolean } = {}) {
  const s = { ...save, savedAt: Date.now() };
  set({ save: s });
  chain = chain.then(() => saveGame(s, opts)).then((ok) => { if (state.saveFailed !== !ok) set({ saveFailed: !ok }); });
  return chain;
}

/** Виконує дію над збереженням; помилки правил гри показує користувачеві. */
export function act(fn: (s: SaveState) => SaveState, okMsg?: string): boolean {
  if (!state.save) return false;
  try {
    const next = fn(state.save);
    if (next !== state.save) void commit(next);
    if (okMsg) toast(okMsg);
    return true;
  } catch (e) {
    if (e instanceof GameError || e instanceof MarketError || e instanceof DevError) toast(e.message, 'err'); else { console.error(e); toast('Сталася помилка. Спробуйте ще раз.', 'err'); }
    return false;
  }
}

export function go(screen: Screen) {
  const menu: Screen[] = ['title', 'hub'];
  set({ screen, back: menu.includes(state.screen) ? state.screen : state.back });
  window.scrollTo(0, 0);
}

/** Куди вести гравця при продовженні: незавершений підсумок туру, церемонія або панель. */
export function resumeScreen(s: SaveState): Screen {
  if (s.pending) return 'post';
  if (s.round >= ROUNDS) return s.offseason ? 'offseason' : 'ceremony';
  return 'hub';
}

export async function boot() {
  const [res, settings] = await Promise.all([loadGame(), loadSettings()]);
  audio.apply(settings);
  // після автоматичного перезавантаження через оновлення гри — одразу повертаємо гравця до його сезону
  let resume = false;
  try { resume = sessionStorage.getItem('bsk-resume') === '1'; sessionStorage.removeItem('bsk-resume'); } catch { /* немає сховища */ }
  set({ loaded: true, save: res.state, settings, recovered: res.recovered, ...(resume && res.state ? { screen: resumeScreen(res.state) } : {}) });
  if (res.recovered) toast('Останнє збереження було пошкоджене — відновлено попередній коректний стан.', 'err');
}

export function updateSettings(patch: Partial<Settings>) {
  const settings = { ...state.settings, ...patch };
  set({ settings });
  audio.apply(settings);
  void saveSettings(settings);
}

export function startNewGame(clubId: string) {
  const seed = (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0;
  const save = newGame(clubId, seed);
  void commit(save, { seasonStart: true });
  set({ screen: 'hub', back: 'title' });
}

/** Виконує дію, що повертає стан і результат (наприклад, текст повідомлення). */
export function actR<T>(fn: (s: SaveState) => { state: SaveState } & T): (T & { state: SaveState }) | null {
  if (!state.save) return null;
  try {
    const r = fn(state.save);
    if (r.state !== state.save) void commit(r.state);
    return r;
  } catch (e) {
    if (e instanceof GameError || e instanceof MarketError || e instanceof DevError) toast(e.message, 'err'); else { console.error(e); toast('Сталася помилка. Спробуйте ще раз.', 'err'); }
    return null;
  }
}

export function startNextSeason() {
  if (!state.save) return;
  try { const next = nextSeason(state.save); void commit(next, { seasonStart: true }); set({ screen: 'hub' }); toast(`Сезон ${next.season} розпочато!`); }
  catch (e) { console.error(e); toast('Не вдалося розпочати сезон', 'err'); }
}

export async function resetProgress() {
  await chain;
  await clearGame();
  set({ save: null, screen: 'select', back: 'title' });
}

export function downloadSave() {
  if (!state.save) return;
  const blob = new Blob([exportSave(state.save)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `bilyi-superkubok-sezon${state.save.season}-tur${state.save.round}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  toast('Збереження експортовано у файл');
}

export async function importFromFile(file: File) {
  try {
    const save = importSave(await file.text());
    await commit(save);
    set({ screen: resumeScreen(save) });
    toast('Збереження імпортовано');
  } catch (e) { toast(e instanceof Error ? e.message : 'Не вдалося імпортувати файл', 'err'); }
}

export async function restoreBackup(which: 'backup' | 'seasonStart') {
  const s = await loadBackup(which);
  if (!s) { toast('Резервної копії не знайдено', 'err'); return; }
  await commit(s);
  set({ screen: resumeScreen(s) });
  toast(which === 'backup' ? 'Відновлено попередній стан' : 'Сезон відновлено з початку');
}
