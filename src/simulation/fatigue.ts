// Модель втоми: як витривалість (0–100%) впливає на гравця. Чисті функції — використовуються симуляцією, інтерфейсом і тестами.
import { BALANCE } from '../data/balance';

const F = BALANCE.fatigue;
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Рівень втоми 0..1: 0 — свіжий, 1 — повністю виснажений. Плавна крива без різких меж. */
export const fatigueLevel = (stamina: number) => Math.pow(1 - clamp01(stamina / 100), F.curveExp);

export const speedMul = (st: number) => 1 - F.speedLoss * fatigueLevel(st);
export const accelMul = (st: number) => 1 - F.accelLoss * fatigueLevel(st);
export const attrMul = (st: number) => 1 - F.attrLoss * fatigueLevel(st);
export const gkMul = (st: number) => 1 - F.gkLoss * fatigueLevel(st);
export const sigmaMul = (st: number) => 1 + F.sigmaGain * fatigueLevel(st);
export const powerMul = (st: number) => 1 - F.powerLoss * fatigueLevel(st);
export const miscontrolChance = (st: number) => F.miscontrol * fatigueLevel(st);
export const reactionLag = (st: number) => F.reactionLag * fatigueLevel(st);
/** Множник ризику травми: зростає повільно до ~50% і різко — нижче 20%. Ніколи не дає гарантованої травми. */
export const injuryRiskMul = (st: number) => 1 + (F.injuryRiskMax - 1) * Math.pow(1 - clamp01(st / 100), 3);

export type FatigueState = 'excellent' | 'normal' | 'tired' | 'heavy' | 'critical';
export function fatigueState(st: number): FatigueState {
  const s = F.states;
  return st >= s.excellent ? 'excellent' : st >= s.normal ? 'normal' : st >= s.tired ? 'tired' : st >= s.heavy ? 'heavy' : 'critical';
}
export const FATIGUE_LABEL: Record<FatigueState, string> = {
  excellent: 'Відмінний стан', normal: 'Нормальний стан', tired: 'Втома', heavy: 'Сильна втома', critical: 'Критичний стан',
};
/** Колір шкали: зелений ≥60, жовтий 40–59, помаранчевий 20–39, червоний <20. */
export function fatigueColor(st: number): 'green' | 'yellow' | 'orange' | 'red' {
  return st >= 60 ? 'green' : st >= 40 ? 'yellow' : st >= 20 ? 'orange' : 'red';
}
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';
export function injuryRiskLevel(st: number): RiskLevel {
  const m = injuryRiskMul(st);
  return m < 1.6 ? 'low' : m < 3 ? 'medium' : m < 5 ? 'high' : 'critical';
}
export const RISK_LABEL: Record<RiskLevel, string> = { low: 'Низький', medium: 'Помірний', high: 'Високий', critical: 'Критичний' };

/** Вартість відновлення до 100%: прогресивна — що більше бракує, то дорожче кожен відсоток. */
export function restoreCost(stamina: number): number {
  const missing = Math.max(0, 100 - stamina);
  if (missing < 0.5) return 0;
  return Math.ceil(missing * F.restoreCostPerPoint * (1 + (missing / 100) * F.restoreCostCurve));
}
