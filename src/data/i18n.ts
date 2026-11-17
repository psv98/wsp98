// Централізована українська локалізація з урахуванням граматичного роду.
// Рід береться з метаданих персонажа (поле gender), а не з закінчення імені.
// Додати нову граматичну форму: розширити WORDS або MSG — компоненти змін не потребують.
import { ROLE_NAMES, type Role } from './formations';
import { SPECIAL_BY_ID, type Gender } from './specials';

export type { Gender };

/** Мінімальні відомості про особу для побудови речень. Звичайні гравці («Гравець №7») — чоловічий граматичний рід. */
export interface Person { name: string; gender: Gender; nameAcc?: string }

export function genderOf(specialId?: string | null): Gender {
  return (specialId && SPECIAL_BY_ID[specialId]?.gender) || 'male';
}

/** Особа за ідентифікатором персонажа або за відображуваним імʼям звичайного гравця. */
export function person(name: string, specialId?: string | null): Person {
  const sp = specialId ? SPECIAL_BY_ID[specialId] : undefined;
  if (sp) return { name: sp.name, gender: sp.gender, nameAcc: sp.nameAcc };
  return { name, gender: 'male', nameAcc: name.replace(/^Гравець /, 'Гравця ') };
}

export const accusative = (p: Person) => p.nameAcc ?? p.name;

type Forms = { m: string; f: string };
/** Словник родових форм. */
export const WORDS = {
  hero: { m: 'Герой матчу', f: 'Героїня матчу' },
  bestPlayer: { m: 'найкращий гравець', f: 'найкраща гравчиня' },
  bestScorer: { m: 'Найкращий бомбардир', f: 'Найкраща бомбардирка' },
  player: { m: 'гравець', f: 'гравчиня' },
  footballer: { m: 'футболіст', f: 'футболістка' },
  champion: { m: 'Чемпіон', f: 'Чемпіонка' },
  goalAuthor: { m: 'Автор гола', f: 'Авторка гола' },
  legendary: { m: 'Легендарний гравець', f: 'Легендарна гравчиня' },
  injured: { m: 'травмований', f: 'травмована' },
  suspended: { m: 'дискваліфікований', f: 'дискваліфікована' },
  sentOff: { m: 'вилучений', f: 'вилучена' },
  // дієслова минулого часу
  suffered: { m: 'зазнав', f: 'зазнала' },
  got: { m: 'отримав', f: 'отримала' },
  scored: { m: 'забив', f: 'забила' },
  made: { m: 'виконав', f: 'виконала' },
  returned: { m: 'повернувся', f: 'повернулася' },
  joined: { m: 'приєднався', f: 'приєдналася' },
  moved: { m: 'перейшов', f: 'перейшла' },
  raised: { m: 'підвищив', f: 'підвищила' },
  missedRun: { m: 'не встиг', f: 'не встигла' },
  stayed: { m: 'залишився', f: 'залишилася' },
  healed: { m: 'вилікуваний', f: 'вилікувана' },
  ready: { m: 'готовий', f: 'готова' },
  tired: { m: 'втомлений', f: 'втомлена' },
  exhausted: { m: 'виснажений', f: 'виснажена' },
} satisfies Record<string, Forms>;

export const w = (key: keyof typeof WORDS, g: Gender) => (g === 'female' ? WORDS[key].f : WORDS[key].m);
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const ROLE_FEM: Record<Role, string> = {
  GK: 'Воротарка', CB: 'Центральна захисниця', FB: 'Крайня захисниця', DM: 'Опорна півзахисниця',
  CM: 'Центральна півзахисниця', AM: 'Атакувальна півзахисниця', W: 'Вінгерка', ST: 'Нападниця',
};
export const roleName = (role: Role, g: Gender) => (g === 'female' ? ROLE_FEM[role] : ROLE_NAMES[role]);

/** Шаблони повідомлень. Кожен приймає особу й сам обирає граматичні форми. */
export const MSG = {
  hero: (p: Person) => `${w('hero', p.gender)}: ${p.name}`,
  heroLine: (p: Person) => `${w('hero', p.gender)} — ${p.name}`,
  bestOfMatch: (p: Person) => `${p.name} — ${w('bestPlayer', p.gender)} матчу`,
  bestScorerSeason: (p: Person, goals: number) => `${w('bestScorer', p.gender)} сезону — ${p.name} (${goals})`,
  injured: (p: Person) => `${p.name} ${w('suffered', p.gender)} травми!`,
  starInjured: (p: Person) => `Травма зірки! ${p.name} не може продовжити матч`,
  yellow: (p: Person, club: string) => `Жовта картка: ${p.name} (${club})`,
  gotYellow: (p: Person) => `${p.name} ${w('got', p.gender)} жовту картку`,
  secondYellow: (p: Person, club: string) => `Друга жовта! ${p.name} ${w('sentOff', p.gender)} — «${club}» у меншості`,
  red: (p: Person, club: string) => `Червона картка! ${p.name} ${w('sentOff', p.gender)} — «${club}» у меншості`,
  banned: (p: Person, matches: string, reason: string) => `${p.name} ${w('suspended', p.gender)} на ${matches} — ${reason}.`,
  returnedFromBan: (p: Person) => `${p.name} ${w('returned', p.gender)} після дискваліфікації`,
  returnedFromInjury: (p: Person) => `${p.name} ${w('returned', p.gender)} після травми`,
  healedNow: (p: Person) => `${p.name} — ${w('healed', p.gender)}, ${w('ready', p.gender)} до наступного матчу`,
  assistMade: (p: Person) => `${p.name} ${w('made', p.gender)} результативну передачу`,
  scored: (p: Person) => `${p.name} ${w('scored', p.gender)} гол`,
  joinedClub: (p: Person) => `${p.name} ${w('joined', p.gender)} до вашого клубу!`,
  movedTo: (p: Person, club: string) => `${p.name} ${w('moved', p.gender)} до клубу «${club}»`,
  stayed: (p: Person) => `${p.name} ${w('stayed', p.gender)} у вашій команді`,
  ratingUp: (p: Person, from: number, to: number) => `${p.name} ${w('raised', p.gender)} рейтинг із ${from} до ${to}!`,
  stormFail: (p: Person) => `${p.name} ${w('missedRun', p.gender)} до штрафного майданчика`,
  offerFor: (club: string, amount: string, p: Person) => `«${club}» пропонує ${amount} за ${accusative(p)}`,
  outbid: (p: Person) => `Інший клуб запропонував вищу суму за ${accusative(p)}`,
  refused: (club: string, p: Person) => `«${club}» відмовився продавати ${accusative(p)}`,
  tiredState: (p: Person) => cap(w('tired', p.gender)),
};
