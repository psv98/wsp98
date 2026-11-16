import type { FormationId, Role } from '../data/formations';
import type { Fx, SpecialDef } from '../data/specials';

export interface PlayerInit {
  pid: string;
  num: number;
  role: Role; // рідна позиція
  q: number; // базовий рейтинг (для особливих береться з конфігурації здібностей)
  stamina: number; // 0..100
  special?: string;
}

export interface TeamSetup {
  clubId: string;
  name: string;
  formation: FormationId;
  discipline: number;
  homeBonus: number; // бонус рейтингу (лише для господарів)
  starters: PlayerInit[]; // 11 (або менше) гравців у порядку слотів схеми
  bench: PlayerInit[];
  isUser: boolean;
  stormArmed?: boolean; // «Повітряний штурм Ісиченка» може статися в цьому матчі
}

export interface MatchSetup { home: TeamSetup; away: TeamSetup; seed: number; autoVar?: boolean }

export type EventType =
  | 'kickoff' | 'goal' | 'ownGoal' | 'shot' | 'save' | 'miss' | 'post' | 'block' | 'foul' | 'yellow' | 'red' | 'secondYellow'
  | 'injury' | 'sub' | 'corner' | 'penalty' | 'freeKick' | 'halftime' | 'fulltime' | 'golden' | 'lastAttack'
  | 'storm' | 'stormFail' | 'var' | 'varOverturn' | 'varStands' | 'varOffer' | 'ability' | 'header' | 'secondHalf' | 'pass' | 'tackle' | 'whistle';

export interface MatchEvent {
  type: EventType;
  min: number; // ігрова хвилина
  minLabel: string;
  team: 0 | 1 | -1;
  pid?: string;
  name?: string; // відображуване імʼя гравця
  special?: string;
  name2?: string; // асистент / хто вийшов на заміну
  text?: string; // додаткова інформація (назва здібності тощо)
  n?: number;
}

export interface TeamStats {
  goals: number; shots: number; onTarget: number; possession: number; corners: number; fouls: number;
  yellows: number; reds: number; saves: number; subs: number; injuries: number; passes: number; passesOk: number;
}

export interface PlayerResult {
  pid: string;
  team: 0 | 1;
  played: boolean;
  minutes: number; // частка матчу 0..1
  staminaEnd: number;
  goals: number; assists: number; saves: number; shots: number; tackles: number;
  yellow: number;
  red: 0 | 1 | 2; // 1 — дві жовті, 2 — пряма червона
  injury: number; // скільки матчів пропустить
  pts: number;
  name: string;
  special?: string;
}

export interface GoalInfo { team: 0 | 1; min: number; minLabel: string; pid: string; name: string; special?: string; assist?: string; own?: boolean; pen?: boolean; header?: boolean }

export interface MatchResult {
  score: [number, number];
  stats: [TeamStats, TeamStats];
  goals: GoalInfo[];
  events: MatchEvent[];
  players: PlayerResult[];
  motm: { pid: string; name: string; team: 0 | 1; special?: string } | null;
  abilities: Record<string, number>;
  stormHappened: [boolean, boolean];
  durationPlayed: number;
}

export interface SimPlayer {
  i: number; team: 0 | 1; pid: string; num: number; nat: Role;
  slot: number; role: Role;
  sp: SpecialDef | null; fx: Fx | null; name: string;
  q: number;
  x: number; y: number; vx: number; vy: number; tx: number; ty: number; sprint: boolean;
  hx: number; hy: number; // напрямок погляду
  force: { x: number; y: number } | null;
  stamina0: number; stamina: number; drain: number; timeOn: number;
  on: boolean; off: null | 'sub' | 'red' | 'inj'; played: boolean;
  stun: number; tackleCd: number; decideT: number; holdT: number; immune: number;
  yellow: number; red: 0 | 1 | 2; injury: number;
  pts: number; goals: number; assists: number; shots: number; saves: number; tackles: number;
  runDx: number; runDy: number; runT: number;
  dive: { x: number; y: number; t: number; reach: boolean } | null;
  diveAnim: number;
}

export interface ShotInfo {
  shooter: number; onTarget: boolean; willSave: boolean; cy: number; header: boolean; penalty: boolean;
  keeper: number; post: boolean; resolved: boolean; dist: number; viaAbility?: string;
}

export interface Flight {
  kind: 'pass' | 'loft' | 'shot' | 'loose';
  by: number; team: 0 | 1; target: number; tried: Set<number>;
  shot?: ShotInfo; land?: { x: number; y: number }; aerialDone?: boolean; t: number; cross?: boolean; storm?: boolean;
}

export interface Ball {
  x: number; y: number; z: number; vx: number; vy: number; vz: number;
  owner: SimPlayer | null; lastTouch: number; lastTeam: 0 | 1; flight: Flight | null; spin: number;
}

export type RestartType = 'kickoff' | 'throwIn' | 'goalKick' | 'corner' | 'freeKick' | 'penalty';
export interface Restart { type: RestartType; team: 0 | 1; x: number; y: number; taker: SimPlayer | null; wait: number; over: number; clockRuns: boolean; storm?: SimPlayer | null }

export type Phase = 'pre' | 'play' | 'dead' | 'wait' | 'var' | 'half' | 'full';
