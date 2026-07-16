// engine/taste.ts
// 오미(五味) 자원 경제. 보스전 중 그 월드의 오미가 축적되고, '오미 사용'으로 소비해
// 맛에 맞는 강한 회복 효과를 낸다. 엔진은 효과 "적용"만 알고, 효과 데이터는 content(worlds.ts).

import { clampMeter, type GameState, type MeterKey } from "./state";

/** 오미 사용 시의 즉시 효과 (HostEvent.instant 와 동형) */
export interface TasteEffect {
  meters?: Partial<Record<MeterKey, number>>;
  inflammation?: number;
  detox?: number;
}

export const TASTE_ACCRUE_RATE = 0.08; // 초당 오미 축적 (보스전 중)
export const TASTE_COST = 1.0; // 1회 사용 비용

/** 보스전 중 현재 월드의 오미를 축적 (tick 에서 호출) */
export function accrueTaste(s: GameState, dt: number): void {
  const taste = s.encounter?.taste;
  if (!taste) return;
  s.tasteResources[taste] = (s.tasteResources[taste] ?? 0) + TASTE_ACCRUE_RATE * dt;
}

/** 오미 보유량 */
export function tasteAmount(s: GameState, taste: string): number {
  return s.tasteResources[taste] ?? 0;
}

/** 오미 사용: 충분하면 비용만큼 소비하고 효과를 적용, 반환값은 성공 여부 */
export function spendTaste(s: GameState, taste: string, effect: TasteEffect): boolean {
  if (tasteAmount(s, taste) < TASTE_COST) return false;
  s.tasteResources[taste] -= TASTE_COST;
  if (effect.meters) {
    for (const k of Object.keys(effect.meters) as MeterKey[]) {
      s.meters[k] = clampMeter(s.meters[k] + (effect.meters[k] ?? 0));
    }
  }
  if (effect.inflammation !== undefined) s.inflammation = clampMeter(s.inflammation + effect.inflammation);
  if (effect.detox !== undefined) s.detox = clampMeter(s.detox + effect.detox);
  return true;
}
