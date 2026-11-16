import type { FormationId, Role } from '../data/formations';
import type { GoalInfo, TeamStats } from '../simulation/types';

export const SAVE_VERSION = 1;

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
}

export interface ClubState {
  id: string;
  boost: number; // зростання сили між сезонами
  formation: FormationId;
  players: PlayerState[]; // 24
  lineup: string[]; // 11 id у порядку слотів схеми
  megaTransfers: string[];
}

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

export interface TransferLogEntry { season: number; round: number; club: string; unitId: string; from?: string; kind: 'mega' | 'star' | 'steal' }

export interface PostMatch {
  round: number;
  user: UserMatchRecord;
  others: MatchSummary[];
  rewards: CoinEntry[];
  card: CardDrop | null;
  cardClaimed: boolean;
  newInjuries: { pid: string; name: string; matches: number }[];
  newBans: { name: string; matches: number; reason: string }[];
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
}

export interface Settings { music: number; sfx: number; crowd: number; muted: boolean; lowGfx: boolean; speed: number }
export const DEFAULT_SETTINGS: Settings = { music: 0.5, sfx: 0.8, crowd: 0.6, muted: false, lowGfx: false, speed: 1 };
