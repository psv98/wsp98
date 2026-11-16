// Мегатрансфери: пул унікальних персонажів, гарантоване випадіння, взаємовиключення комплектів, трансфери суперників.
import { BALANCE as B } from '../data/balance';
import { CLUB_BY_ID } from '../data/clubs';
import { roleFit } from '../data/formations';
import { FORMATIONS } from '../data/formations';
import { SPECIAL_BY_ID, STARS, TRANSFER_UNITS, type TransferUnit } from '../data/specials';
import type { Rng } from '../simulation/rng';
import { weightedPick } from '../simulation/rng';
import { genericPlayer } from './squad';
import type { CardDrop, ClubState, PlayerState, SaveState, TransferLogEntry } from './types';

const T = B.transfers;
export const UNIT_BY_ID: Record<string, TransferUnit> = Object.fromEntries(TRANSFER_UNITS.map((u) => [u.id, u]));
for (const s of STARS) UNIT_BY_ID[s.id] = { id: s.id, rarity: s.rarity, members: [s.id] };

export const unitOwner = (state: SaveState, unit: TransferUnit): string | null => state.transfers.owners[unit.members[0]] ?? null;

function unitAllowedByLock(state: SaveState, unit: TransferUnit): boolean {
  if (!unit.bundle) return true;
  const lock = state.transfers.legendaryLock;
  return !lock || lock === unit.bundle;
}

/** Кандидати на випадіння користувачу: вільні персонажі або ті, що грають у суперників («сюжетний перехід»). */
export function userCandidates(state: SaveState): { unit: TransferUnit; steal: boolean }[] {
  const res: { unit: TransferUnit; steal: boolean }[] = [];
  for (const unit of TRANSFER_UNITS) {
    const owner = unitOwner(state, unit);
    if (owner === state.userClub) continue; // без дублікатів
    if (!owner && !unitAllowedByLock(state, unit)) continue; // взаємовиключний комплект цього сезону
    res.push({ unit, steal: !!owner });
  }
  return res;
}

export const marketOpen = (state: SaveState) => state.transfers.marketOpenUntil >= state.round && state.round < 34;

/** Кидок мегатрансферу після матчу користувача. Не змінює стан. */
export function rollCard(state: SaveState, rng: Rng): CardDrop | null {
  const guaranteed = state.transfers.pity + 1 >= T.pityMatches;
  if (!guaranteed && rng() >= T.dropChance) return null;
  const cands = userCandidates(state);
  const perRarity: Record<string, number> = {};
  for (const u of TRANSFER_UNITS) perRarity[u.rarity] = (perRarity[u.rarity] ?? 0) + 1;
  type Opt = { drop: CardDrop; w: number };
  const opts: Opt[] = cands.map(({ unit, steal }) => ({
    drop: { kind: 'unit', unitId: unit.id, from: steal ? unitOwner(state, unit)! : undefined } as CardDrop,
    w: ((T.weights as Record<string, number>)[unit.rarity] / perRarity[unit.rarity]) * (steal ? T.stealFactor : 1),
  }));
  const E = B.economy;
  // джекпот — не частіше одного разу за сезон і лише коли ринок закрито
  if (!marketOpen(state) && state.transfers.jackpotSeason !== state.season) {
    opts.push({ drop: { kind: 'jackpot', amount: Math.round((E.jackpotMin + rng() * (E.jackpotMax - E.jackpotMin)) / 100) * 100 }, w: T.weights.jackpot });
  }
  // спеціальна трансферна подія (спонсорський бонус) — завжди можлива альтернатива картці
  opts.push({ drop: { kind: 'sponsor', amount: Math.round((E.sponsorFallbackMin + rng() * (E.sponsorFallbackMax - E.sponsorFallbackMin)) / 100) * 100 }, w: T.weights.sponsor });
  const pickd = weightedPick(rng, opts, (o) => o.w);
  return pickd!.drop;
}

function idxOf(p: PlayerState): number { return Number(p.id.split('-').pop()); }

function removeSpecial(state: SaveState, clubId: string, specialId: string) {
  const club = state.clubs[clubId];
  if (!club) return;
  const i = club.players.findIndex((p) => p.special === specialId);
  if (i >= 0) {
    const old = club.players[i];
    const fresh = genericPlayer(CLUB_BY_ID[clubId], idxOf(old), state.seed + state.season * 101);
    fresh.id = old.id; fresh.num = old.num;
    club.players[i] = fresh;
  }
  club.megaTransfers = club.megaTransfers.filter((x) => x !== specialId);
}

function addSpecial(state: SaveState, clubId: string, specialId: string) {
  const club = state.clubs[clubId];
  const sp = SPECIAL_BY_ID[specialId];
  const inXI = new Set(club.lineup);
  const cands = club.players.filter((p) => !p.special);
  // кого замінюємо: звичайний гравець тієї ж ролі з резерву; якщо таких немає — найслабший запасний
  const score = (p: PlayerState) => (p.role === sp.role ? 0 : 100 - roleFit(p.role, sp.role) * 50) + (inXI.has(p.id) ? 40 : 0) + (p.role === 'GK' && sp.role !== 'GK' ? 500 : 0) + (sp.role === 'GK' && p.role !== 'GK' ? 500 : 0) + p.q * 0.1;
  const target = cands.sort((a, b) => score(a) - score(b))[0];
  if (!target) return;
  target.special = specialId; target.role = sp.role; target.q = sp.opp.q; target.stamina = 100; target.injured = 0; target.suspended = 0; target.yellows = 0;
  target.s = { apps: 0, goals: 0, assists: 0, yc: 0, rc: 0, saves: 0, motm: 0 };
  if (!club.megaTransfers.includes(specialId)) club.megaTransfers.push(specialId);
  state.transfers.owners[specialId] = clubId;
}

/** Передає персонажа або комплект клубу. Унікальний персонаж не може грати за два клуби одночасно. */
export function giveUnit(state: SaveState, clubId: string, unitId: string, kind: TransferLogEntry['kind']): TransferLogEntry {
  const unit = UNIT_BY_ID[unitId];
  const from = unitOwner(state, unit) ?? undefined;
  for (const m of unit.members) {
    const prev = state.transfers.owners[m];
    if (prev === clubId) continue;
    if (prev) removeSpecial(state, prev, m);
    addSpecial(state, clubId, m);
  }
  if (unit.bundle) state.transfers.legendaryLock = unit.bundle;
  const entry: TransferLogEntry = { season: state.season, round: state.round, club: clubId, unitId, from: from && from !== clubId ? from : undefined, kind: from && from !== clubId ? 'steal' : kind };
  state.transfers.log.push(entry);
  return entry;
}

/** Ставить щойно отриманих гравців одразу в стартовий склад (замість найслабших на відповідних позиціях). */
export function putInLineup(club: ClubState, specialIds: string[]) {
  const slots = FORMATIONS[club.formation];
  for (const sid of specialIds) {
    const p = club.players.find((x) => x.special === sid);
    if (!p || club.lineup.includes(p.id)) continue;
    const byId = new Map(club.players.map((x) => [x.id, x]));
    let best = -1, bs = -1e9;
    slots.forEach((sl, i) => {
      const cur = byId.get(club.lineup[i] ?? '');
      if (cur?.special) return;
      const fit = roleFit(p.role, sl.role);
      if (fit < 0.5) return;
      const s = fit * 100 - (cur ? cur.q : 0) * 0.5 + (cur ? 0 : 50);
      if (s > bs) { bs = s; best = i; }
    });
    if (best >= 0) club.lineup[best] = p.id;
  }
}

/** Трансфери суперників у поточному турі (викликається після матчів туру). */
export function aiTransfers(state: SaveState, rng: Rng, reserved?: string): TransferLogEntry[] {
  const out: TransferLogEntry[] = [];
  const roundNo = state.round + 1; // номер щойно зіграного туру
  const aiClubs = Object.keys(state.clubs).filter((id) => id !== state.userClub);
  const free = () => TRANSFER_UNITS.filter((u) => u.id !== reserved && !unitOwner(state, u) && unitAllowedByLock(state, u));
  const clubsWithout = () => { const c = aiClubs.filter((id) => state.clubs[id].megaTransfers.length === 0); return c.length ? c : aiClubs; };
  if (roundNo >= T.aiFromRound) {
    if (state.transfers.aiCount < T.aiMaxPerSeason && rng() < T.aiRoundChance) {
      const unit = weightedPick(rng, free(), (u) => (T.aiWeights as Record<string, number>)[u.rarity] ?? 0);
      if (unit) {
        const cs = clubsWithout();
        out.push(giveUnit(state, cs[Math.floor(rng() * cs.length)], unit.id, 'mega'));
        state.transfers.aiCount++;
      }
    }
    // Оксана має зʼявитися хоча б в одному клубі протягом сезону
    if (roundNo >= T.oksanaForceRound && !state.transfers.owners['oksana'] && reserved !== 'oksana') {
      const cs = clubsWithout();
      out.push(giveUnit(state, cs[Math.floor(rng() * cs.length)], 'oksana', 'mega'));
    }
    if (state.season >= T.aiStarsFromSeason && rng() < T.aiStarChance) {
      const st = STARS.filter((s) => !state.transfers.owners[s.id]);
      if (st.length) {
        const s = st[Math.floor(rng() * st.length)];
        out.push(giveUnit(state, aiClubs[Math.floor(rng() * aiClubs.length)], s.id, 'star'));
      }
    }
  }
  return out;
}

export function unitName(unitId: string): string {
  if (unitId === 'trio') return 'Аналітичне супертріо';
  if (unitId === 'duo') return 'Юридичне мегадуо';
  return SPECIAL_BY_ID[unitId]?.name ?? unitId;
}
