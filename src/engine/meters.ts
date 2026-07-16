// engine/meters.ts
// 4대 미터(숲·물길·온기·빛) + 염증 + 해독 + 뿌리노드의 연속 시뮬레이션.
//
// 매 틱 각 미터에 걸리는 "순 압력(per sec)"을 적분한다:
//   pressure(k) = 뿌리노드지지(k) + Σ(meter-scope add mod) + 되먹임(k) − 염증드래그 − 해독드래그 − 게이지overflow
//
// 뿌리노드 → 미터 → 생산 으로 이어지는 사슬. diversity(내구도)와 4출력이 하류를 좌우한다(만류귀종).

import {
  clampMeter,
  METER_KEYS,
  type GameState,
  type MeterKey,
} from "./state";
import { isActive } from "./modifiers";

// 튜닝 상수 (per sec). "완벽한 밸런스"가 아니라 곡선을 관찰·튜닝할 출발점.
export const METER_TUNING = {
  rootSupport: 0.03, // 뿌리노드 출력 → 미터 지지 계수
  inflammationDrag: 0.05, // 염증 → 전 미터 하락 압력
  detoxDrag: 0.03, // 해독 부담 → 전 미터 하락 압력
  inflammationDefense: 0.05, // 뿌리노드 면역·해독 → 염증 저항
  detoxClear: 0.05, // 뿌리노드 해독 출력 → 해독 부담 감소
  gaugeOverflowDrag: 0.08, // 질병 게이지 overflow(>1) 시 전 미터 하락
  // 되먹임 고리 (§7 장-뇌축, 염증-인슐린)
  gutBrainCoupling: 0.03, // 장↓ → 세로토닌↓ → 빛(mind) 하락
  mindCortisolCoupling: 0.04, // 빛↓ → 코르티솔↑ → 염증 상승
};

/** 뿌리노드 출력 → 특정 미터 지지량(per sec) */
export function rootnodeSupport(s: GameState, key: MeterKey): number {
  const o = s.rootnode.outputs;
  const d = s.rootnode.diversity;
  const k = METER_TUNING.rootSupport;
  switch (key) {
    case "gut":
      return k * (o.scfa * 0.7 + d * 0.3); // SCFA(부티레이트) → 숲
    case "mind":
      return k * (o.neuro * 0.7 + d * 0.3); // 신경전달(세로토닌 90%가 장) → 빛
    case "water":
      return k * (d * 0.6 + o.detox * 0.4);
    case "warmth":
      return k * (d * 0.6 + o.scfa * 0.4);
  }
}

/** meter-scope add modifier 합 (target=key or "*") — 보스 디버프(−) / 플레이어·부스터(+) */
function meterModAdd(s: GameState, key: MeterKey, now: number): number {
  let add = 0;
  for (const m of s.modifiers) {
    if (m.scope !== "meter") continue;
    if (!(m.target === undefined || m.target === "*" || m.target === key)) continue;
    if (!isActive(m, s, now)) continue;
    if (m.type === "add") add += m.value.toNumber();
  }
  return add;
}

/** 되먹임 고리(장-뇌축): 특정 미터에 붙는 추가 압력(per sec) */
function feedback(s: GameState, key: MeterKey): number {
  if (key === "mind") {
    // 장(gut)이 낮으면 세로토닌 원료 부족 → 빛(mind) 하락 압력
    return -METER_TUNING.gutBrainCoupling * (1 - s.meters.gut);
  }
  return 0;
}

/** 특정 미터의 순 압력(per sec) */
export function meterPressure(s: GameState, key: MeterKey, now: number): number {
  const support = rootnodeSupport(s, key);
  const drag =
    METER_TUNING.inflammationDrag * s.inflammation +
    METER_TUNING.detoxDrag * s.detox;
  const modAdd = meterModAdd(s, key, now);
  const overflow =
    s.encounter && s.encounter.gauge > 1 ? METER_TUNING.gaugeOverflowDrag : 0;
  return support + modAdd + feedback(s, key) - drag - overflow;
}

/** 식(識) 잠금 해제 여부 — 지반(장·수·열 평균) 회복 + 염증 진정 시 true */
export function mindFoundationMet(
  s: GameState,
  lock: { foundationMeters: number; foundationInflammation: number }
): boolean {
  const avg = (s.meters.gut + s.meters.water + s.meters.warmth) / 3;
  return avg >= lock.foundationMeters && s.inflammation <= lock.foundationInflammation;
}

export function stepMeters(s: GameState, dt: number, now: number): void {
  // 압력을 먼저 모아 동시에 적용 (미터 간 상호참조 시 순서 편향 방지)
  const deltas: Record<MeterKey, number> = { gut: 0, water: 0, warmth: 0, mind: 0 };
  for (const key of METER_KEYS) deltas[key] = meterPressure(s, key, now) * dt;
  for (const key of METER_KEYS) s.meters[key] = clampMeter(s.meters[key] + deltas[key]);

  // 식(識) 잠금(우울): 지반이 회복되기 전엔 빛(mind)이 cap 위로 오르지 못한다.
  // → "그냥 긍정"이 불가능. 몸(장·수·열 + 염증)을 먼저 고쳐야 마음이 열림.
  const lock = s.encounter?.mindLock;
  if (lock && !mindFoundationMet(s, lock)) {
    s.meters.mind = Math.min(s.meters.mind, lock.cap);
  }
}

export function stepInflammation(s: GameState, dt: number): void {
  const regen = s.encounter?.inflammationRegen ?? 0;
  const defense =
    METER_TUNING.inflammationDefense *
    ((s.rootnode.outputs.immune + s.rootnode.outputs.detox) / 2);
  // 되먹임: 빛(mind)이 낮으면 코르티솔↑ → 염증 상승
  const cortisol = METER_TUNING.mindCortisolCoupling * (1 - s.meters.mind);
  s.inflammation = clampMeter(s.inflammation + (regen + cortisol - defense) * dt);
}

export function stepDetox(s: GameState, dt: number): void {
  const inflow = s.encounter?.detoxInflow ?? 0;
  const clear = METER_TUNING.detoxClear * s.rootnode.outputs.detox;
  s.detox = clampMeter(s.detox + (inflow - clear) * dt);
}

export function stepGauge(s: GameState, dt: number): void {
  const e = s.encounter;
  if (!e) return;
  switch (e.gaugeBehavior) {
    case "fill":
      e.gauge += e.gaugeFill * dt; // 혈당: 계속 차오름
      break;
    case "drain":
      e.gauge = Math.max(0, e.gauge - e.gaugeFill * dt);
      break;
    case "stealthGrow":
      e.gauge += e.gaugeFill * 0.3 * dt; // 은신 증식(느리게)
      break;
  }
  if (e.gauge < 0) e.gauge = 0;
}

/** 한 스텝의 전체 생태계 시뮬레이션 (tick 에서 호출) */
export function stepEcosystem(s: GameState, dt: number, now: number): void {
  stepInflammation(s, dt);
  stepDetox(s, dt);
  stepGauge(s, dt);
  stepMeters(s, dt, now);
}
