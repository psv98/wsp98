import type { FormationId, Role } from '../data/formations';
import type { BoostKey, GoalInfo, TeamStats } from '../simulation/types';

export const SAVE_VERSION = 2;

export interface PlayerSeasonStats { apps: number; goals: number; assists: number; yc: number; rc: number; saves: number; motm: number }

export interface PlayerState {
  id: string;
  num: number;
  role: Role;
  q: number;
  stamina: number;
  injured: number; // скільки матчів ще пропустить
  suspended: number;
  yellows: number;
  special?: string;
  s: PlayerSeasonStats;
  dev?: PlayerDev;
}

/** Розвиток гравця між сезонами. */
export interface PlayerDev {
  gained: number; // сумарна прибавка до рейтингу
  season: number; // сезон останнього міжсезоння, у якому було покращення
  count: number; // скільки пунктів куплено в цьому міжсезонні (максимум 2)
  focus: Partial<Record<BoostKey, number>>; // бонуси обраних напрямів
  log: { season: number; from: number; to: number; focus: string }[];
}

export interface ClubState {
  id: string;
  boost: number; // зростання сили між сезонами
  formation: FormationId;
  players: PlayerState[]; // 24
  lineup: string[]; // 11 id у порядку слотів схеми
  megaTransfers: string[];
  coins: number; // бюджет клубу (для клубу користувача не використовується — див. SaveState.coins)
  finance: ClubFinance;
}

export interface ClubFinance { season: number; income: number; spend: number; log: CoinEntry[] }

export interface Fixture { home: string; away: string }

export interface MatchSummary {
  round: number; // 0..33
  home: string; away: string;
  score: [number, number];
}

export interface UserMatchRecord extends MatchSummary {
  goals: GoalInfo[];
  stats: [TeamStats, TeamStats];
  motm: { name: string; team: 0 | 1; special?: string } | null;
  abilities: Record<string, number>;
  injuries: { name: string; team: 0 | 1; matches: number }[];
  cards: { name: string; team: 0 | 1; kind: 'yellow' | 'red' }[];
  subs: { out: string; in: string; team: 0 | 1; min: string }[];
  topSaves?: { name: string; saves: number };
}

export interface CoinEntry { season: number; round: number; amount: number; reason: string }

export type CardDrop =
  | { kind: 'unit'; unitId: string; from?: string }
  | { kind: 'jackpot'; amount: number }
  | { kind: 'sponsor'; amount: number };

export interface TransferLogEntry { season: number; round: number; club: string; unitId: string; from?: string; kind: 'mega' | 'star' | 'steal' | 'market'; price?: number }

export interface PostMatch {
  round: number;
  user: UserMatchRecord;
  others: MatchSummary[];
  rewards: CoinEntry[];
  card: CardDrop | null;
  cardClaimed: boolean;
  newInjuries: { pid: string; name: string; matches: number; special?: string }[];
  newBans: { name: string; matches: number; reason: string; special?: string }[];
  aiTransfers: TransferLogEntry[];
  sensation: MatchSummary[]; // «Сенсація туру»
  seasonFinished: boolean;
}

export interface TableRow { id: string; p: number; w: number; d: number; l: number; gf: number; ga: number; gd: number; pts: number; form: ('W' | 'D' | 'L')[] }

export interface SeasonRecord {
  season: number;
  champion: string;
  table: TableRow[];
  userPos: number;
  userPts: number;
  topScorers: { name: string; club: string; goals: number; special?: string }[];
  transfers: TransferLogEntry[];
  achievements: string[];
  userResults: { round: number; opp: string; home: boolean; score: [number, number] }[];
  coinsEarned: number;
  offseason?: { bought: string[]; sold: string[]; news: string[]; ratingChanges: { id: string; name: string; from: number; to: number }[]; spent: number; income: number };
}

export interface TransferState {
  pity: number; // матчів без випадіння
  owners: Record<string, string>; // specialId -> clubId
  legendaryLock: 'trio' | 'duo' | null;
  aiCount: number;
  marketOpenUntil: number; // індекс туру, до якого відкрите вікно (-1 — закрито)
  log: TransferLogEntry[];
  ihor: { count: number; target: number };
  drops: number;
  jackpotSeason?: number; // сезон, у якому вже випадав джекпот
}

export interface SaveState {
  version: number;
  createdAt: number;
  savedAt: number;
  seed: number;
  userClub: string;
  season: number;
  round: number; // індекс наступного туру (34 — сезон завершено)
  schedule: Fixture[][];
  results: MatchSummary[][];
  clubs: Record<string, ClubState>;
  coins: number;
  coinLog: CoinEntry[];
  transfers: TransferState;
  pending: PostMatch | null;
  userMatches: UserMatchRecord[];
  history: SeasonRecord[];
  events: { season: number; round: number; text: string }[];
  offseason: OffseasonState | null;
}

export type DealStatus = 'open' | 'countered' | 'outbid' | 'won' | 'lost' | 'rejected' | 'withdrawn';
/** Переговори користувача про купівлю (з конкурентами — це аукціон). */
export interface Deal {
  id: string;
  specialId: string;
  seller: string | null; // null — вільний агент (світова зірка без клубу)
  value: number; // ринкова вартість на момент старту
  ask: number; // прихована ціна продавця
  round: number; // поточний раунд торгів (1..maxRounds)
  userBid: number;
  rivals: { club: string; bid: number; max: number }[];
  counter?: number;
  status: DealStatus;
  message: string;
  winner?: string;
  price?: number;
}
/** Пропозиція іншого клубу за гравця користувача. */
export interface IncomingOffer {
  id: string;
  specialId: string;
  buyer: string;
  amount: number;
  max: number; // прихована межа покупця
  status: 'pending' | 'accepted' | 'rejected' | 'countered' | 'declined';
  countered?: number;
  message?: string;
}
export interface OffseasonState {
  season: number;
  startCoins: number;
  deals: Deal[];
  incoming: IncomingOffer[];
  news: string[];
  bought: string[];
  sold: string[];
  ratingChanges: { id: string; name: string; from: number; to: number }[];
  devSpent: number;
  transferSpent: number;
  transferIncome: number;
  nonce: number;
}

export interface Settings { music: number; sfx: number; crowd: number; muted: boolean; lowGfx: boolean; speed: number }
export const DEFAULT_SETTINGS: Settings = { music: 0.5, sfx: 0.8, crowd: 0.6, muted: false, lowGfx: false, speed: 2 };
