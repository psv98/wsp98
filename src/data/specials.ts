// Унікальні персонажі ІМІ, комплекти та світові зірки. Ефекти задаються окремо для клубу користувача та суперника.
import type { Rarity } from './rarity';
import type { Role } from './formations';

/** Ігрові ефекти здібностей. Застосовуються лише за відповідних умов у симуляції. */
export interface Fx {
  q: number; // базовий рейтинг
  finish?: number; // імовірність гола при ударі у площину воріт (перекриває кидок сейву)
  finishDanger?: number; // імовірність гола з небезпечної позиції
  eliteFinish?: number; // імовірність гола у площину воріт проти особливого воротаря (Ісиченко, Буффон)
  save?: number; // імовірність сейву звичайного удару у площину
  tackle?: number; // імовірність успішного відбору, коли гравець у зоні відбору
  block?: number; // імовірність блоку удару, коли гравець на лінії удару
  intercept?: number; // множник перехоплень
  speed?: number; // множник швидкості
  evade?: number; // множник шансу суперника відібрати мʼяч (менше = кращий дриблінг)
  pass?: number; // множник похибки передачі (менше = точніше)
  cross?: number; // множник похибки навісу
  header?: number; // бонус до гри головою
  power?: number; // множник сили удару
  teamAtk?: number; teamDef?: number; teamPass?: number; // командні бонуси
  teamCross?: number; // множник розкиду флангових навісів команди (менше — точніше)
  /** Акробатичний удар через себе після навісу («Європейські ножиці») */
  scissors?: { attempt: number; onTarget: number; goal: number };
}

export type Gender = 'female' | 'male';

export interface SpecialDef {
  id: string;
  name: string;
  /** Граматичний рід для повідомлень (не визначається за іменем автоматично) */
  gender: Gender;
  /** Знахідний відмінок імені («пропозиція за Ірину Земляну») */
  nameAcc: string;
  short: string;
  title: string;
  rarity: Rarity;
  /** imi — персонажі ІМІ; guest — запрошені персонажі (випадають як мегатрансфер); star — світові зірки ринку */
  kind: 'imi' | 'guest' | 'star';
  /** Множник імовірності випадіння відносно середнього для рідкісності */
  dropWeight?: number;
  /** Організація, яку представляє персонаж */
  org?: string;
  role: Role;
  side?: 'L' | 'R';
  roleName: string;
  ability: string;
  perks: string[];
  bundle?: 'trio' | 'duo';
  fatigue: number; // множник втоми (0 — не втомлюється)
  noInjury?: boolean;
  price?: number;
  img: string;
  user: Fx;
  opp: Fx;
}

// Оригінальний логотип ІМІ з UI kit (накладається на картку окремим елементом)
const IMI = 'assets/ui/branding/imi-round-original.svg';

export const SPECIALS: SpecialDef[] = [
  {
    id: 'oksana', gender: 'female', nameAcc: 'Оксану Романюк', name: 'Оксана Романюк', short: 'Оксана Р.', title: 'Абсолютна нападниця', rarity: 'divine', kind: 'imi',
    role: 'ST', roleName: 'Нападниця', ability: 'Невідворотний гол', fatigue: 0, noInjury: true, img: IMI,
    perks: ['100% голів з ударів у площину воріт', 'Надзвичайний дриблінг', 'Посилює атаку всієї команди', 'Не втомлюється'],
    user: { q: 99, finish: 1, eliteFinish: 1, evade: 0.55, speed: 1.04, teamAtk: 3 },
    opp: { q: 90, finish: 0.5, eliteFinish: 0.25, evade: 0.85, speed: 1.02 },
  },
  {
    id: 'hanna', gender: 'female', nameAcc: 'Ганну Чабарай', name: 'Ганна Чабарай', short: 'Ганна Ч.', title: 'Комунікаційний прорив', rarity: 'mythic', kind: 'imi',
    role: 'ST', roleName: 'Нападниця / вінгерка', ability: 'Комунікаційний прорив', fatigue: 0.7, img: IMI,
    perks: ['65% реалізації небезпечних моментів', 'Висока швидкість', 'Ідеально відкривається під передачі', 'Здатна пробити навіть Ігоря Ісиченка'],
    user: { q: 93, finishDanger: 0.65, eliteFinish: 0.32, speed: 1.1, evade: 0.75, teamAtk: 2 },
    opp: { q: 86, finishDanger: 0.42, eliteFinish: 0.18, speed: 1.05, evade: 0.8 },
  },
  {
    id: 'ihor', gender: 'male', nameAcc: 'Ігоря Ісиченка', name: 'Ігор Ісиченко', short: 'Ігор І.', title: 'Залізна брама', rarity: 'mythic', kind: 'imi',
    role: 'GK', roleName: 'Воротар', ability: 'Залізна брама + «Повітряний штурм»', fatigue: 0, img: IMI,
    perks: ['Майже непробивний для звичайних ударів', 'Не втомлюється', 'Посилює захист команди', 'Раз на 5–7 матчів іде на чужий кутовий'],
    // у суперника — приблизно 90% від рівня в клубі користувача
    user: { q: 93, save: 0.975, teamDef: 3, header: 14 },
    opp: { q: 90, save: 0.88, teamDef: 2, header: 12 },
  },
  {
    id: 'barkar', gender: 'male', nameAcc: 'Дмитра Баркара', name: 'Дмитро Баркар', short: 'Дмитро Б.', title: 'Тотальний контроль', rarity: 'legendary', kind: 'imi', bundle: 'trio',
    role: 'CM', roleName: 'Центральний півзахисник', ability: 'Аналітичне супертріо', fatigue: 0.85, img: IMI,
    perks: ['60–65% успішних відборів', 'Контроль центру поля', 'Швидкий перехід в атаку'],
    user: { q: 90, tackle: 0.63, pass: 0.6, teamPass: 2 }, opp: { q: 84, tackle: 0.48, pass: 0.8, teamPass: 1 },
  },
  {
    id: 'mashkova', gender: 'female', nameAcc: 'Яну Машкову', name: 'Яна Машкова', short: 'Яна М.', title: 'Тотальний контроль', rarity: 'legendary', kind: 'imi', bundle: 'trio',
    role: 'DM', roleName: 'Опорна півзахисниця', ability: 'Аналітичне супертріо', fatigue: 0.85, img: IMI,
    perks: ['60–65% успішних відборів', 'Страхує оборону', 'Покращує передачі команди'],
    user: { q: 90, tackle: 0.65, intercept: 1.25, pass: 0.65, teamDef: 2 }, opp: { q: 84, tackle: 0.5, intercept: 1.1, pass: 0.85, teamDef: 1 },
  },
  {
    id: 'holub', gender: 'female', nameAcc: 'Олену Голуб', name: 'Олена Голуб', short: 'Олена Г.', title: 'Тотальний контроль', rarity: 'legendary', kind: 'imi', bundle: 'trio',
    role: 'AM', roleName: 'Атакувальна півзахисниця', ability: 'Аналітичне супертріо', fatigue: 0.85, img: IMI,
    perks: ['60–65% успішних відборів', 'Гострі передачі вперед', 'Посилює командну взаємодію'],
    user: { q: 90, tackle: 0.6, pass: 0.55, teamPass: 2, teamAtk: 1 }, opp: { q: 84, tackle: 0.46, pass: 0.8, teamPass: 1 },
  },
  {
    id: 'zelenchuk', gender: 'male', nameAcc: 'Володимира Зеленчука', name: 'Володимир Зеленчук', short: 'Володимир З.', title: 'Закон на полі', rarity: 'legendary', kind: 'imi', bundle: 'duo',
    role: 'CM', roleName: 'Універсальний півзахисник', ability: 'Юридичний VAR', fatigue: 0.85, img: IMI,
    perks: ['Захищається й атакує', 'Перехоплення та гольові передачі', '«Юридичний VAR» — раз за матч'],
    user: { q: 90, tackle: 0.55, intercept: 1.2, pass: 0.65, teamPass: 2 }, opp: { q: 84, tackle: 0.45, intercept: 1.1, pass: 0.85, teamPass: 1 },
  },
  {
    id: 'stoinov', gender: 'male', nameAcc: 'Петра Стойнова', name: 'Петро Стойнов', short: 'Петро С.', title: 'Закон на полі', rarity: 'legendary', kind: 'imi', bundle: 'duo',
    role: 'CM', roleName: 'Універсальний півзахисник', ability: 'Юридичний VAR', fatigue: 0.85, img: IMI,
    perks: ['Захищається й атакує', 'Створює атаки з глибини', '«Юридичний VAR» — раз за матч'],
    user: { q: 90, tackle: 0.55, intercept: 1.2, pass: 0.65, teamDef: 1, teamAtk: 1 }, opp: { q: 84, tackle: 0.45, intercept: 1.1, pass: 0.85 },
  },
  {
    id: 'zakhar', gender: 'male', nameAcc: 'Захара Давиденка', name: 'Захар Давиденко', short: 'Захар Д.', title: 'Непрохідна стіна', rarity: 'epic', kind: 'imi',
    role: 'CB', roleName: 'Центральний захисник', ability: 'Непрохідна стіна', fatigue: 0.9, img: IMI,
    perks: ['70% успішних відборів', 'Блокує небезпечні атаки', 'Забиває головою після кутових'],
    user: { q: 88, tackle: 0.7, block: 0.4, header: 14, teamDef: 2 }, opp: { q: 82, tackle: 0.5, block: 0.3, header: 9 },
  },
  {
    id: 'dudka', gender: 'male', nameAcc: 'Дмитра Дудку', name: 'Дмитро Дудка', short: 'Дмитро Д.', title: 'Блокування атаки', rarity: 'epic', kind: 'imi',
    role: 'CB', roleName: 'Центральний захисник', ability: 'Блокування атаки', fatigue: 0.9, img: IMI,
    perks: ['70% блокувань ударів із вигідної позиції', 'Допомагає воротарю', 'Сильна гра головою на стандартах'],
    user: { q: 88, block: 0.7, tackle: 0.52, header: 13, teamDef: 2 }, opp: { q: 82, block: 0.45, tackle: 0.42, header: 9 },
  },
  {
    id: 'zemliana', gender: 'female', nameAcc: 'Ірину Земляну', name: 'Ірина Земляна', short: 'Ірина З.', title: 'Репортаж із флангу', rarity: 'epic', kind: 'imi',
    role: 'W', side: 'L', roleName: 'Ліва вінгерка', ability: 'Репортаж із флангу', fatigue: 0.95, img: IMI,
    perks: ['Висока швидкість', 'Різкі флангові прориви', 'Сильні прострільні передачі'],
    user: { q: 88, speed: 1.14, evade: 0.65, cross: 0.5 }, opp: { q: 82, speed: 1.07, evade: 0.85, cross: 0.75 },
  },
  {
    id: 'diachuk', gender: 'female', nameAcc: 'Катерину Дячук', name: 'Катерина Дячук', short: 'Катерина Д.', title: 'Точна комбінація', rarity: 'epic', kind: 'imi',
    role: 'AM', roleName: 'Атакувальна півзахисниця', ability: 'Точна комбінація', fatigue: 0.95, img: IMI,
    perks: ['Підвищена точність передач', 'Створює атакувальні комбінації', 'Посилює останню передачу'],
    user: { q: 88, pass: 0.45, teamPass: 3, teamAtk: 1 }, opp: { q: 82, pass: 0.7, teamPass: 1 },
  },
  {
    id: 'katarina-mathernova', gender: 'female', nameAcc: 'Катаріну Матернову', name: 'Катаріна Матернова', short: 'Катаріна М.', title: 'Повітряна блискавка', rarity: 'epic', kind: 'guest',
    org: 'Європейський Союз', dropWeight: 0.45, // рідше за середній епічний персонаж
    role: 'ST', side: 'R', roleName: 'Нападниця / права вінгерка', ability: 'Європейські ножиці', fatigue: 1, img: 'assets/specials/eu.png',
    perks: ['Майстриня акробатичних ударів', '«Європейські ножиці»: удар через себе після навісу', 'Висока швидкість і дриблінг', 'Посилює флангові навіси команди'],
    // швидкість 94, дриблінг 90, удари 88, гра головою 80, передачі 84, захист 48 — через модифікатори наявної системи рейтингів
    user: { q: 87, speed: 1.14, evade: 0.72, header: -9, pass: 0.9, teamCross: 0.85, scissors: { attempt: 0.2, onTarget: 0.65, goal: 0.6 } },
    opp: { q: 83, speed: 1.08, evade: 0.82, header: -9, pass: 0.95, teamCross: 0.9, scissors: { attempt: 0.16, onTarget: 0.55, goal: 0.5 } },
  },
  {
    id: 'troian', gender: 'female', nameAcc: 'Валентину Троян', name: 'Валентина Троян', short: 'Валентина Т.', title: 'Фортеця центру', rarity: 'rare', kind: 'imi',
    role: 'DM', roleName: 'Опорна півзахисниця', ability: 'Фортеця центру', fatigue: 1, img: IMI,
    perks: ['+20% до перехоплень', 'Контроль середини поля', 'Допомагає центральним захисникам'],
    user: { q: 84, intercept: 1.2, tackle: 0.5, teamDef: 1 }, opp: { q: 79, intercept: 1.1 },
  },
  {
    id: 'ihnatieva', gender: 'female', nameAcc: 'Марію Ігнатьєву', name: 'Марія Ігнатьєва', short: 'Марія І.', title: 'Швидкий прорив', rarity: 'rare', kind: 'imi',
    role: 'W', side: 'R', roleName: 'Права вінгерка', ability: 'Швидкий прорив', fatigue: 1, img: IMI,
    perks: ['+25% до швидкості та флангових атак', 'Прискорені забігання', 'Небезпечні прострільні'],
    user: { q: 84, speed: 1.2, cross: 0.75, evade: 0.8 }, opp: { q: 79, speed: 1.1, cross: 0.9 },
  },
  // ---- Світові зірки (трансферний ринок) ----
  {
    id: 'messi', gender: 'male', nameAcc: 'Ліонеля Мессі', name: 'Ліонель Мессі', short: 'Мессі', title: 'Світова зірка', rarity: 'legendary', kind: 'star', price: 10000,
    role: 'AM', roleName: 'Атакувальний футболіст', ability: 'Магія дриблінгу', fatigue: 1, img: 'assets/stars/messi.png',
    perks: ['Сильний дриблінг і передачі', 'Підвищена реалізація моментів'],
    user: { q: 92, evade: 0.55, pass: 0.6, finishDanger: 0.5, eliteFinish: 0.2 }, opp: { q: 90, evade: 0.6, pass: 0.65, finishDanger: 0.45, eliteFinish: 0.16 },
  },
  {
    id: 'ronaldo', gender: 'male', nameAcc: 'Кріштіану Роналду', name: 'Кріштіану Роналду', short: 'Роналду', title: 'Світова зірка', rarity: 'legendary', kind: 'star', price: 13000,
    role: 'ST', roleName: 'Нападник', ability: 'Гарматний удар', fatigue: 1, img: 'assets/stars/ronaldo.png',
    perks: ['Потужні удари', 'Висока ефективність гри головою'],
    user: { q: 93, power: 1.18, header: 16, finishDanger: 0.52, eliteFinish: 0.22 }, opp: { q: 91, power: 1.15, header: 14, finishDanger: 0.47, eliteFinish: 0.18 },
  },
  {
    id: 'neymar', gender: 'male', nameAcc: 'Неймара', name: 'Неймар', short: 'Неймар', title: 'Світова зірка', rarity: 'legendary', kind: 'star', price: 11000,
    role: 'W', side: 'L', roleName: 'Атакувальний вінгер', ability: 'Самба на фланзі', fatigue: 1.1, img: 'assets/stars/neymar.png',
    perks: ['Висока швидкість', 'Сильний дриблінг', 'Створює гольові моменти'],
    user: { q: 91, speed: 1.12, evade: 0.55, cross: 0.7 }, opp: { q: 89, speed: 1.1, evade: 0.6, cross: 0.75 },
  },
  {
    id: 'buffon', gender: 'male', nameAcc: 'Джанлуїджі Буффона', name: 'Джанлуїджі Буффон', short: 'Буффон', title: 'Світова зірка', rarity: 'legendary', kind: 'star', price: 12000,
    role: 'GK', roleName: 'Воротар', ability: 'Досвід легенди', fatigue: 0.6, img: 'assets/stars/buffon.png',
    perks: ['Покращена реакція', 'Посилені сейви'],
    user: { q: 92, save: 0.74 }, opp: { q: 90, save: 0.66 },
  },
];

export const SPECIAL_BY_ID: Record<string, SpecialDef> = Object.fromEntries(SPECIALS.map((s) => [s.id, s]));
export const IMI_SPECIALS = SPECIALS.filter((s) => s.kind === 'imi');
/** Усі персонажі, що випадають як мегатрансфер (ІМІ та запрошені). */
export const DROP_SPECIALS = SPECIALS.filter((s) => s.kind !== 'star');
export const STARS = SPECIALS.filter((s) => s.kind === 'star');

export interface BundleDef { id: 'trio' | 'duo'; name: string; title: string; members: string[]; bonus: string }
export const BUNDLES: Record<'trio' | 'duo', BundleDef> = {
  trio: { id: 'trio', name: 'Аналітичне супертріо', title: 'Тотальний контроль', members: ['barkar', 'mashkova', 'holub'], bonus: 'Контроль центру: +точність передач, 60–65% відборів, швидкий перехід в атаку. Бонус слабшає, якщо хтось із трьох не грає.' },
  duo: { id: 'duo', name: 'Юридичне мегадуо', title: 'Закон на полі', members: ['zelenchuk', 'stoinov'], bonus: '«Юридичний VAR»: раз за матч перегляд спірного епізоду. Рішення не гарантоване.' },
};

/** Одиниця трансферного пулу: одиночний персонаж або комплект. */
export interface TransferUnit { id: string; rarity: Rarity; members: string[]; bundle?: 'trio' | 'duo'; weight?: number }
export const TRANSFER_UNITS: TransferUnit[] = [
  ...DROP_SPECIALS.filter((s) => !s.bundle).map((s) => ({ id: s.id, rarity: s.rarity, members: [s.id], weight: s.dropWeight })),
  { id: 'trio', rarity: 'legendary' as Rarity, members: BUNDLES.trio.members, bundle: 'trio' as const },
  { id: 'duo', rarity: 'legendary' as Rarity, members: BUNDLES.duo.members, bundle: 'duo' as const },
];
