import { describe, expect, it } from 'vitest';
import { MSG, WORDS, genderOf, person, roleName } from '../src/data/i18n';
import { SPECIALS } from '../src/data/specials';
import { eventLine } from '../src/game/commentary';
import type { MatchEvent } from '../src/simulation/types';

const ev = (type: MatchEvent['type'], name: string, special?: string): MatchEvent => ({ type, min: 10, minLabel: '10', team: 0, name, special });

describe('фемінітиви', () => {
  it('кожен персонаж має явно заданий рід і знахідний відмінок', () => {
    for (const sp of SPECIALS) { expect(['female', 'male']).toContain(sp.gender); expect(sp.nameAcc.length).toBeGreaterThan(2); }
    expect(genderOf('hanna')).toBe('female');
    expect(genderOf('zakhar')).toBe('male');
    expect(genderOf(undefined)).toBe('male'); // «Гравець №7»
  });

  it('рід не визначається за закінченням імені', () => {
    // Олена Голуб і Катерина Дячук — прізвища без жіночого закінчення
    expect(MSG.bestOfMatch(person('', 'holub'))).toBe('Олена Голуб — найкраща гравчиня матчу');
    expect(MSG.injured(person('', 'diachuk'))).toBe('Катерина Дячук зазнала травми!');
  });

  it('жіночі форми', () => {
    const h = person('', 'hanna');
    expect(MSG.heroLine(h)).toBe('Героїня матчу — Ганна Чабарай');
    expect(MSG.bestScorerSeason(person('', 'oksana'), 31)).toBe('Найкраща бомбардирка сезону — Оксана Романюк (31)');
    expect(MSG.assistMade(person('', 'zemliana'))).toBe('Ірина Земляна виконала результативну передачу');
    expect(MSG.gotYellow(person('', 'mashkova'))).toBe('Яна Машкова отримала жовту картку');
    expect(MSG.ratingUp(person('', 'troian'), 79, 81)).toBe('Валентина Троян підвищила рейтинг із 79 до 81!');
    expect(MSG.offerFor('УП Альянс', '42 000 MC', person('', 'zemliana'))).toBe('«УП Альянс» пропонує 42 000 MC за Ірину Земляну');
    expect(MSG.banned(person('', 'ihnatieva'), '2 матчі', 'червона картка')).toContain('Марія Ігнатьєва дискваліфікована');
    expect(roleName('ST', 'female')).toBe('Нападниця');
    expect(roleName('GK', 'female')).toBe('Воротарка');
  });

  it('чоловічі форми', () => {
    expect(MSG.injured(person('', 'barkar'))).toBe('Дмитро Баркар зазнав травми!');
    expect(MSG.returnedFromBan(person('', 'zakhar'))).toBe('Захар Давиденко повернувся після дискваліфікації');
    expect(MSG.heroLine(person('', 'ihor'))).toBe('Герой матчу — Ігор Ісиченко');
    expect(MSG.outbid(person('', 'zakhar'))).toBe('Інший клуб запропонував вищу суму за Захара Давиденка');
    expect(MSG.offerFor('Х', '1 MC', person('Гравець №7'))).toContain('за Гравця №7');
  });

  it('коментар матчу узгоджує рід', () => {
    expect(eventLine(ev('red', 'Яна Машкова', 'mashkova'), ['А', 'Б'])!.text).toContain('Яна Машкова вилучена');
    expect(eventLine(ev('red', 'Петро Стойнов', 'stoinov'), ['А', 'Б'])!.text).toContain('Петро Стойнов вилучений');
    expect(eventLine(ev('secondYellow', 'Гравець №4'), ['А', 'Б'])!.text).toContain('Гравець №4 вилучений');
    expect(eventLine(ev('injury', 'Гравець №9'), ['А', 'Б'])!.text).toBe('Гравець №9 зазнав травми!');
  });

  it('у словнику є обидві форми для кожного слова', () => {
    for (const f of Object.values(WORDS)) { expect(f.m).toBeTruthy(); expect(f.f).toBeTruthy(); }
  });
});
