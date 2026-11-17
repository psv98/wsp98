// Сховище прогресу: IndexedDB (основне) з резервом у localStorage. Версіонування, контрольна сума, резервні копії.
import { CLUBS, LEGACY_NAMES } from '../data/clubs';
import { clubStartCoins } from '../systems/squad';
import { SAVE_VERSION, type SaveState, type Settings, DEFAULT_SETTINGS } from '../systems/types';

const DB_NAME = 'bilyi-superkubok';
const STORE = 'kv';
const K_CUR = 'save:current', K_BAK = 'save:backup', K_SEASON = 'save:seasonStart', K_SET = 'settings';

interface Envelope { schema: number; savedAt: number; checksum: number; json: string }

export function checksum(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/** Структурна перевірка збереження. Повертає текст помилки або null. */
export function validateSave(d: unknown): string | null {
  const s = d as SaveState;
  if (!s || typeof s !== 'object') return 'Порожнє збереження';
  if (typeof s.version !== 'number' || s.version > SAVE_VERSION) return 'Непідтримувана версія збереження';
  if (typeof s.userClub !== 'string' || !s.clubs || !s.clubs[s.userClub]) return 'Не знайдено клуб користувача';
  if (Object.keys(s.clubs).length !== CLUBS.length) return 'Неправильна кількість клубів';
  for (const c of CLUBS) {
    const club = s.clubs[c.id];
    if (!club || !Array.isArray(club.players) || club.players.length !== 24 || !Array.isArray(club.lineup)) return `Пошкоджений склад клубу ${c.id}`;
  }
  if (!Array.isArray(s.schedule) || s.schedule.length !== 34 || s.schedule.some((r) => !Array.isArray(r) || r.length !== 9)) return 'Пошкоджений календар';
  if (!Number.isInteger(s.round) || s.round < 0 || s.round > 34) return 'Некоректний номер туру';
  if (!Array.isArray(s.results) || s.results.length !== s.round) return 'Результати не відповідають номеру туру';
  if (!Number.isFinite(s.coins) || s.coins < 0) return 'Некоректний баланс медіакоїнів';
  if (!Number.isInteger(s.season) || s.season < 1) return 'Некоректний номер сезону';
  if (!s.transfers || typeof s.transfers.owners !== 'object' || !Array.isArray(s.history) || !Array.isArray(s.coinLog)) return 'Пошкоджені дані трансферів або історії';
  if (s.version >= 2 && CLUBS.some((c) => !Number.isFinite(s.clubs[c.id].coins) || s.clubs[c.id].coins < 0)) return 'Некоректний бюджет клубу';
  // унікальність персонажів: кожен належить не більше ніж одному клубу
  const seen = new Set<string>();
  for (const c of CLUBS) for (const p of s.clubs[c.id].players) if (p.special) { if (seen.has(p.special)) return `Дублікат персонажа ${p.special}`; seen.add(p.special); }
  return null;
}

/** Перейменування старих назв клубів у збережених текстах (ідентифікатори клубів не змінювались). */
export function renameLegacy(text: string): string {
  let t = text;
  for (const [old, now] of Object.entries(LEGACY_NAMES)) t = t.split(old).join(now);
  return t;
}

/**
 * Міграції схеми збережень. Ідемпотентні: повторне застосування нічого не змінює й не створює дублікатів.
 * v1 → v2: бюджети й фінанси клубів-суперників, поле міжсезоння, нові назви шести клубів у текстах подій.
 */
export function migrate(d: SaveState): SaveState {
  if (!d || typeof d !== 'object') return d;
  if (d.version === 1) {
    for (const def of CLUBS) {
      const c = d.clubs?.[def.id];
      if (!c) continue;
      if (typeof c.coins !== 'number') c.coins = clubStartCoins(def);
      if (!c.finance) c.finance = { season: d.season, income: 0, spend: 0, log: [] };
    }
    if (d.offseason === undefined) d.offseason = null;
    d.version = 2;
  }
  // назви в текстах подій та новинах (безпечно застосовувати повторно)
  if (Array.isArray(d.events)) for (const e of d.events) e.text = renameLegacy(e.text);
  if (d.offseason?.news) d.offseason.news = d.offseason.news.map(renameLegacy);
  for (const h of d.history ?? []) if (h.offseason?.news) h.offseason.news = h.offseason.news.map(renameLegacy);
  return d;
}

function pack(state: SaveState): Envelope {
  const json = JSON.stringify(state);
  return { schema: SAVE_VERSION, savedAt: state.savedAt, checksum: checksum(json), json };
}

function unpack(env: unknown): SaveState | null {
  const e = env as Envelope;
  if (!e || typeof e.json !== 'string' || checksum(e.json) !== e.checksum) return null;
  try {
    const data = migrate(JSON.parse(e.json) as SaveState);
    return validateSave(data) ? null : data;
  } catch { return null; }
}

// ---- низькорівневий доступ ----
let dbp: Promise<IDBDatabase | null> | null = null;
function openDb(): Promise<IDBDatabase | null> {
  if (dbp) return dbp;
  dbp = new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') return resolve(null);
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE); };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch { resolve(null); }
  });
  return dbp;
}
export function _resetDbForTests() { dbp = null; }

const ls = () => { try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch { return null; } };

async function getMany(keys: string[]): Promise<unknown[]> {
  const db = await openDb();
  if (!db) return keys.map((k) => { try { const v = ls()?.getItem(`${DB_NAME}:${k}`); return v ? JSON.parse(v) : undefined; } catch { return undefined; } });
  return new Promise((resolve) => {
    const out: unknown[] = new Array(keys.length);
    const tx = db.transaction(STORE, 'readonly');
    keys.forEach((k, i) => { const r = tx.objectStore(STORE).get(k); r.onsuccess = () => { out[i] = r.result; }; });
    tx.oncomplete = () => resolve(out);
    tx.onerror = tx.onabort = () => resolve(out);
  });
}

/** Атомарний запис кількох ключів однією транзакцією. */
async function putMany(entries: [string, unknown][], removes: string[] = []): Promise<boolean> {
  const db = await openDb();
  if (!db) {
    const l = ls(); if (!l) return false;
    try { for (const [k, v] of entries) l.setItem(`${DB_NAME}:${k}`, JSON.stringify(v)); for (const k of removes) l.removeItem(`${DB_NAME}:${k}`); return true; } catch { return false; }
  }
  return new Promise((resolve) => {
    const tx = db.transaction(STORE, 'readwrite');
    const st = tx.objectStore(STORE);
    for (const [k, v] of entries) st.put(v, k);
    for (const k of removes) st.delete(k);
    tx.oncomplete = () => resolve(true);
    tx.onerror = tx.onabort = () => resolve(false);
  });
}

// ---- публічний API ----
let lastGood: Envelope | null = null;

export async function saveGame(state: SaveState, opts: { seasonStart?: boolean } = {}): Promise<boolean> {
  const err = validateSave(state);
  if (err) { console.error('Збереження скасовано — некоректний стан:', err); return false; }
  const env = pack(state);
  const entries: [string, unknown][] = [[K_CUR, env]];
  if (lastGood) entries.push([K_BAK, lastGood]); // попередній коректний стан стає резервною копією
  if (opts.seasonStart) entries.push([K_SEASON, env]);
  const ok = await putMany(entries);
  if (ok) lastGood = env;
  return ok;
}

export interface LoadResult { state: SaveState | null; recovered: boolean; hadData: boolean }

/** Завантаження з відновленням останнього коректного стану, якщо поточний запис пошкоджено. */
export async function loadGame(): Promise<LoadResult> {
  const [cur, bak, season] = await getMany([K_CUR, K_BAK, K_SEASON]);
  const a = unpack(cur);
  if (a) { lastGood = cur as Envelope; return { state: a, recovered: false, hadData: true }; }
  for (const env of [bak, season]) {
    const s = unpack(env);
    if (s) { lastGood = env as Envelope; return { state: s, recovered: true, hadData: true }; }
  }
  return { state: null, recovered: false, hadData: !!(cur || bak || season) };
}

export async function loadBackup(which: 'backup' | 'seasonStart'): Promise<SaveState | null> {
  const [env] = await getMany([which === 'backup' ? K_BAK : K_SEASON]);
  return unpack(env);
}

export async function clearGame(): Promise<void> {
  lastGood = null;
  await putMany([], [K_CUR, K_BAK, K_SEASON]);
}

export async function loadSettings(): Promise<Settings> {
  const [v] = await getMany([K_SET]);
  return { ...DEFAULT_SETTINGS, ...((v as Partial<Settings>) ?? {}) };
}
export const saveSettings = (s: Settings) => putMany([[K_SET, s]]);

export function exportSave(state: SaveState): string {
  const env = pack(state);
  return JSON.stringify({ app: DB_NAME, ...env });
}

export function importSave(text: string): SaveState {
  let obj: unknown;
  try { obj = JSON.parse(text); } catch { throw new Error('Файл не є коректним JSON'); }
  const o = obj as Envelope & { app?: string };
  if (o && o.app === DB_NAME && typeof o.json === 'string') {
    if (checksum(o.json) !== o.checksum) throw new Error('Файл збереження пошкоджено (контрольна сума не збігається)');
    obj = JSON.parse(o.json);
  }
  const data = migrate(obj as SaveState);
  const err = validateSave(data);
  if (err) throw new Error(err);
  return data;
}
