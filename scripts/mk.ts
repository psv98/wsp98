import type { PlayerInit, TeamSetup } from '../src/simulation/types';
import { SQUAD_ROLES } from '../src/data/formations';

export function mkTeam(id: string, q: number, isUser = false, specials: Record<number, string> = {}, stamina = 100): TeamSetup {
  const all: PlayerInit[] = SQUAD_ROLES.map((role, i) => ({ pid: `${id}-${i}`, num: i + 1, role, q: i < 11 ? q : q - 3, stamina, special: specials[i] }));
  return { clubId: id, name: id, formation: '4-3-3', discipline: 70, homeBonus: 1.6, starters: all.slice(0, 11), bench: all.slice(11), isUser };
}

