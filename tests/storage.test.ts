import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { _resetDbForTests, clearGame, exportSave, importSave, loadGame, loadSettings, saveGame, saveSettings, validateSave } from '../src/storage/db';
import { clone, newGame } from '../src/systems/season';

function rawPut(key: string, value: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('bilyi-superkubok', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('kv');
    req.onsuccess = () => { const tx = req.result.transaction('kv', 'readwrite'); tx.objectStore('kv').put(value, key); tx.oncomplete = () => { req.result.close(); resolve(); }; tx.onerror = () => reject(tx.error); };
  });
}

describe('збереження', () => {
  beforeEach(async () => { _resetDbForTests(); await clearGame(); });

  it('запис і читання повертають той самий стан', async () => {
    const s = newGame('babel', 7, 111);
    expect(await saveGame(s)).toBe(true);
    const r = await loadGame();
    expect(r.recovered).toBe(false);
    expect(r.state).toEqual(s);
  });

  it('пошкоджений запис відновлюється з останнього коректного стану', async () => {
    const s1 = newGame('babel', 7, 111);
    await saveGame(s1);
    const s2 = clone(s1); s2.coins = 9999; s2.savedAt = 222;
    await saveGame(s2);
    await rawPut('save:current', { schema: 1, savedAt: 1, checksum: 123, json: '{"зіпсовано":' });
    const r = await loadGame();
    expect(r.recovered).toBe(true);
    expect(r.state?.coins).toBe(s1.coins);
  });

  it('некоректний стан не записується поверх коректного', async () => {
    const s = newGame('babel', 7, 111);
    await saveGame(s);
    const bad = clone(s); bad.coins = NaN;
    expect(await saveGame(bad)).toBe(false);
    const bad2 = clone(s); bad2.clubs.babel.players.pop();
    expect(await saveGame(bad2)).toBe(false);
    expect((await loadGame()).state).toEqual(s);
  });

  it('експорт та імпорт JSON; пошкоджений файл відхиляється', () => {
    const s = newGame('lb', 99, 5);
    const text = exportSave(s);
    expect(importSave(text)).toEqual(s);
    expect(() => importSave('не json')).toThrow();
    expect(() => importSave(text.replace('"coins\\":1500', '"coins\\":999999'))).toThrow(/пошкоджено/);
    expect(() => importSave(JSON.stringify({ foo: 1 }))).toThrow();
  });

  it('валідатор перевіряє структуру', () => {
    const s = newGame('lb', 99, 5);
    expect(validateSave(s)).toBeNull();
    expect(validateSave(null)).not.toBeNull();
    expect(validateSave({ ...s, round: 40 })).not.toBeNull();
    expect(validateSave({ ...s, schedule: s.schedule.slice(1) })).not.toBeNull();
    expect(validateSave({ ...s, round: 2 })).not.toBeNull(); // результатів менше, ніж турів
    expect(validateSave({ ...s, version: 999 })).not.toBeNull();
  });

  it('повне скидання видаляє прогрес; налаштування зберігаються окремо', async () => {
    await saveGame(newGame('babel', 7, 111));
    await saveSettings({ music: 0.1, sfx: 0.2, crowd: 0.3, muted: true, lowGfx: true, speed: 2 });
    await clearGame();
    expect((await loadGame()).state).toBeNull();
    expect((await loadSettings()).muted).toBe(true);
  });
});
