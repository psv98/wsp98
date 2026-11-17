// Тексти коментаря до подій матчу (українською, з урахуванням граматичного роду).
import { MSG, person } from '../data/i18n';
import type { MatchEvent } from '../simulation/types';

export interface Line { text: string; tone: 'goal' | 'warn' | 'info' | 'special' | 'bad'; big?: boolean }

const VAR_KIND: Record<string, string> = { goal: 'гол', penalty: 'пенальті', red: 'вилучення' };

export function eventLine(e: MatchEvent, clubs: [string, string]): Line | null {
  const club = e.team >= 0 ? clubs[e.team as 0 | 1] : '';
  const who = e.name ?? 'Гравець';
  const p = person(who, e.special);
  switch (e.type) {
    case 'kickoff': return null;
    case 'goal': if (e.text === 'scissors') return { text: `НЕЙМОВІРНИЙ ГОЛ! ${who.toUpperCase()} ЗАБИВАЄ НОЖИЦЯМИ!${e.name2 ? ` Асист: ${e.name2}` : ''}`, tone: 'goal', big: true };
      return { text: `ГОЛ! ${who}. ${club}${e.text === 'pen' ? ' · з пенальті' : e.text === 'head' ? ' · головою' : ''}${e.name2 ? ` · асист: ${e.name2}` : ''}`, tone: 'goal', big: true };
    case 'ownGoal': return { text: `Автогол! ${who} зрізає мʼяч у власні ворота — гол на користь «${club}»`, tone: 'goal', big: true };
    case 'save': return { text: `Сейв! ${who} відбиває удар${e.name2 ? ` (${e.name2})` : ''}`, tone: 'info' };
    case 'miss': return { text: `${who} бʼє повз ворота`, tone: 'info' };
    case 'post': return { text: `Каркас воріт! ${who} влучає у стійку`, tone: 'warn' };
    case 'block': return { text: `${who} блокує удар`, tone: 'info' };
    case 'foul': return { text: `Фол: ${who} (${club})`, tone: 'info' };
    case 'yellow': return { text: MSG.yellow(p, club), tone: 'warn', big: true };
    case 'secondYellow': return { text: MSG.secondYellow(p, club), tone: 'bad', big: true };
    case 'red': return { text: MSG.red(p, club), tone: 'bad', big: true };
    case 'injury': return { text: e.special ? MSG.starInjured(p) : MSG.injured(p), tone: 'bad', big: true };
    case 'sub': return { text: `Заміна (${club}): ${who} ⟶ ${e.name2}`, tone: 'info' };
    case 'corner': return { text: `Кутовий — «${club}»`, tone: 'info' };
    case 'penalty': return { text: `ПЕНАЛЬТІ на користь «${club}»!`, tone: 'warn', big: true };
    case 'halftime': return { text: 'Перерва', tone: 'info' };
    case 'secondHalf': return { text: 'Починається другий тайм', tone: 'info' };
    case 'fulltime': return { text: 'Фінальний свисток!', tone: 'info' };
    case 'order': return e.text === 'attack' ? { text: `«${club}»: усі в атаку!`, tone: 'special', big: true } : e.text === 'press' ? { text: `«${club}» вмикає пресинг!`, tone: 'special', big: true } : { text: `«${club}» сідає в оборону`, tone: 'info', big: true };
    case 'golden': return { text: `«Золота хвилина»! «${club}» йде у навалу`, tone: 'special', big: true };
    case 'lastAttack': return { text: `«Остання атака»! «${club}» має шанс`, tone: 'special', big: true };
    case 'scissors': return { text: `«Європейські ножиці»! ${who} бʼє через себе!`, tone: 'special', big: true };
    case 'storm': return { text: `«Повітряний штурм Ісиченка»! Воротар біжить на кутовий!`, tone: 'special', big: true };
    case 'stormFail': return { text: MSG.stormFail(p), tone: 'info' };
    case 'varOffer': return null;
    case 'var': return { text: `«Юридичний VAR»: арбітр переглядає епізод (${VAR_KIND[e.text ?? ''] ?? 'епізод'})`, tone: 'special', big: true };
    case 'varOverturn': return { text: e.text === 'goal' ? 'VAR: гол скасовано!' : e.text === 'penalty' ? 'VAR: пенальті скасовано!' : 'VAR: замість вилучення — жовта картка', tone: 'special', big: true };
    case 'varStands': return { text: 'VAR: рішення арбітра залишається в силі', tone: 'info', big: true };
    default: return null;
  }
}
