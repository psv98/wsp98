// Тактичні схеми. Координати нормовані: x — від власних воріт (0) до чужих (1), y — 0 (лівий фланг) .. 1.
export type Role = 'GK' | 'CB' | 'FB' | 'DM' | 'CM' | 'AM' | 'W' | 'ST';
export type FormationId = '4-3-3' | '4-4-2' | '4-2-3-1' | '5-3-2';

export interface Slot { role: Role; x: number; y: number; label: string }

const GK: Slot = { role: 'GK', x: 0.04, y: 0.5, label: 'ВР' };
const back4: Slot[] = [
  { role: 'FB', x: 0.22, y: 0.14, label: 'ЛЗ' },
  { role: 'CB', x: 0.17, y: 0.37, label: 'ЦЗ' },
  { role: 'CB', x: 0.17, y: 0.63, label: 'ЦЗ' },
  { role: 'FB', x: 0.22, y: 0.86, label: 'ПЗ' },
];

export const FORMATIONS: Record<FormationId, Slot[]> = {
  '4-3-3': [GK, ...back4,
    { role: 'DM', x: 0.34, y: 0.5, label: 'ОП' },
    { role: 'CM', x: 0.45, y: 0.3, label: 'ЦП' },
    { role: 'CM', x: 0.45, y: 0.7, label: 'ЦП' },
    { role: 'W', x: 0.68, y: 0.13, label: 'ЛВ' },
    { role: 'ST', x: 0.74, y: 0.5, label: 'НП' },
    { role: 'W', x: 0.68, y: 0.87, label: 'ПВ' }],
  '4-4-2': [GK, ...back4,
    { role: 'W', x: 0.5, y: 0.12, label: 'ЛВ' },
    { role: 'CM', x: 0.42, y: 0.38, label: 'ЦП' },
    { role: 'CM', x: 0.42, y: 0.62, label: 'ЦП' },
    { role: 'W', x: 0.5, y: 0.88, label: 'ПВ' },
    { role: 'ST', x: 0.72, y: 0.4, label: 'НП' },
    { role: 'ST', x: 0.72, y: 0.6, label: 'НП' }],
  '4-2-3-1': [GK, ...back4,
    { role: 'DM', x: 0.34, y: 0.38, label: 'ОП' },
    { role: 'DM', x: 0.34, y: 0.62, label: 'ОП' },
    { role: 'W', x: 0.6, y: 0.13, label: 'ЛВ' },
    { role: 'AM', x: 0.58, y: 0.5, label: 'АП' },
    { role: 'W', x: 0.6, y: 0.87, label: 'ПВ' },
    { role: 'ST', x: 0.76, y: 0.5, label: 'НП' }],
  '5-3-2': [GK,
    { role: 'FB', x: 0.27, y: 0.1, label: 'ЛЗ' },
    { role: 'CB', x: 0.17, y: 0.3, label: 'ЦЗ' },
    { role: 'CB', x: 0.15, y: 0.5, label: 'ЦЗ' },
    { role: 'CB', x: 0.17, y: 0.7, label: 'ЦЗ' },
    { role: 'FB', x: 0.27, y: 0.9, label: 'ПЗ' },
    { role: 'CM', x: 0.42, y: 0.3, label: 'ЦП' },
    { role: 'DM', x: 0.38, y: 0.5, label: 'ОП' },
    { role: 'CM', x: 0.42, y: 0.7, label: 'ЦП' },
    { role: 'ST', x: 0.72, y: 0.4, label: 'НП' },
    { role: 'ST', x: 0.72, y: 0.6, label: 'НП' }],
};

export const FORMATION_IDS = Object.keys(FORMATIONS) as FormationId[];

export const ROLE_NAMES: Record<Role, string> = {
  GK: 'Воротар', CB: 'Центральний захисник', FB: 'Крайній захисник', DM: 'Опорний півзахисник',
  CM: 'Центральний півзахисник', AM: 'Атакувальний півзахисник', W: 'Вінгер', ST: 'Нападник',
};
export const ROLE_SHORT: Record<Role, string> = { GK: 'ВР', CB: 'ЦЗ', FB: 'КЗ', DM: 'ОП', CM: 'ЦП', AM: 'АП', W: 'ВН', ST: 'НП' };

/** Наскільки добре гравець ролі `nat` грає на позиції `slot` (1 = рідна). */
export function roleFit(nat: Role, slot: Role): number {
  if (nat === slot) return 1;
  if (nat === 'GK' || slot === 'GK') return 0.45;
  const groups: Record<Role, number> = { GK: 0, CB: 1, FB: 1.6, DM: 2.4, CM: 3, AM: 3.8, W: 4.4, ST: 5 };
  const d = Math.abs(groups[nat] - groups[slot]);
  return Math.max(0.72, 1 - d * 0.06);
}

/** Склад заявки з 24 гравців за ролями. */
export const SQUAD_ROLES: Role[] = [
  'GK', 'FB', 'CB', 'CB', 'FB', 'DM', 'CM', 'CM', 'W', 'ST', 'W', // базові 11 (4-3-3)
  'GK', 'GK', 'CB', 'CB', 'FB', 'FB', 'DM', 'CM', 'AM', 'AM', 'W', 'ST', 'ST',
];
