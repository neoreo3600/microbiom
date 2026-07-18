// engine/rootnode.ts
// 만류귀종(萬流歸宗) 종속 규칙: 상류(뿌리노드)가 하류(보스)를 수학적으로 좌우한다.
//   - 뿌리노드 diversity(내구도)가 높을수록 하류 보스 시작 미터가 덜 무너지고 염증 regen 이 약하다.
//   - 뿌리를 재건하면 미클리어 하류 난이도↓, 클리어 하류 재발저항↑.
// "장부터"가 잔소리가 아니라 유리한 전략이 되도록.

import { clampMeter, METER_KEYS, type Boss, type GameState, type MeterKey } from "./state";

export const ROOT_TUNING = {
  soften: 0.6, // diversity 가 보스 시작 미터를 완화하는 정도
  regenAmplify: 1.0, // 뿌리 약할수록 염증 regen 이 증폭되는 정도
};

/** 뿌리노드 재건 (재생 손길): diversity + 4출력을 함께 끌어올린다. */
export function healRootnode(s: GameState, amount: number): void {
  const r = s.rootnode;
  r.diversity = clampMeter(r.diversity + amount);
  // 다양성이 오르면 출력도 따라 오른다 (생태계 복원)
  r.outputs.immune = clampMeter(r.outputs.immune + amount * 0.8);
  r.outputs.neuro = clampMeter(r.outputs.neuro + amount * 0.8);
  r.outputs.scfa = clampMeter(r.outputs.scfa + amount);
  r.outputs.detox = clampMeter(r.outputs.detox + amount * 0.7);
}

export function degradeRootnode(s: GameState, amount: number): void {
  const r = s.rootnode;
  r.diversity = clampMeter(r.diversity - amount);
  r.outputs.immune = clampMeter(r.outputs.immune - amount);
  r.outputs.neuro = clampMeter(r.outputs.neuro - amount);
  r.outputs.scfa = clampMeter(r.outputs.scfa - amount);
  r.outputs.detox = clampMeter(r.outputs.detox - amount);
}

/** 하류 난이도 계수 (0=쉬움 ~ 1=지옥). diversity 가 높을수록 낮아진다. */
export function downstreamDifficulty(s: GameState): number {
  return clampMeter(1 - s.rootnode.diversity);
}

/**
 * 뿌리노드 상태를 반영한 보스 시작 미터.
 *   softened = base + (1-base) × diversity × soften
 * → diversity 가 높을수록 덜 무너진 상태로 시작 (상류 정비의 보상).
 */
export function computeStartMeters(boss: Boss, s: GameState): Record<MeterKey, number> {
  const d = s.rootnode.diversity;
  const out = {} as Record<MeterKey, number>;
  for (const k of METER_KEYS) {
    const base = boss.startMeters[k];
    out[k] = clampMeter(base + (1 - base) * d * ROOT_TUNING.soften);
  }
  return out;
}

/**
 * 뿌리노드 상태를 반영한 염증 self-regen.
 *   regen × (1 + (1-diversity) × amplify)
 * → 약한 뿌리(diversity 낮음)일수록 하류 보스가 강하게 재생.
 */
export function adjustedInflammationRegen(boss: Boss, s: GameState): number {
  return boss.inflammation.regen * (1 + (1 - s.rootnode.diversity) * ROOT_TUNING.regenAmplify);
}
