// engine/modifiers.ts
// Modifier 스택 → effective rate / cost / offline 계산.
//
// 계산 순서 (고정, 문서화):
//   base → additive(+) 합산 → multiplicative(×) 곱 → global mult
//
// 이 순서는 booster 만료 시 정확 원복(수용기준 4)을 보장하기 위해 결합/교환 순서를
// 완전히 결정론적으로 고정한 것이다.

import Decimal from "break_infinity.js";
import { meterHealthMult, type GameState, type Generator, type ModScope, type Modifier } from "./state";

/** target 이 대상 id 와 일치하거나 글로벌("*")이면 true */
function hitsTarget(mod: Modifier, id: string): boolean {
  return mod.target === undefined || mod.target === "*" || mod.target === id;
}

/** 현재 유효한(만료 X, 조건 충족) modifier 만 통과 */
export function isActive(mod: Modifier, s: GameState, now: number): boolean {
  if (mod.expiresAt !== undefined && mod.expiresAt <= now) return false;
  if (mod.condition && !mod.condition(s)) return false;
  return true;
}

export function activeModifiers(s: GameState, now: number): Modifier[] {
  return s.modifiers.filter((m) => isActive(m, s, now));
}

/**
 * 특정 scope / target 에 대한 (additive 합, multiplicative 곱)을 반환.
 * additive: Σ value,  multiplicative: Π value
 */
function collect(
  s: GameState,
  now: number,
  scope: ModScope,
  targetId: string
): { add: Decimal; mult: Decimal } {
  let add = new Decimal(0);
  let mult = new Decimal(1);
  for (const m of s.modifiers) {
    if (m.scope !== scope) continue;
    if (!hitsTarget(m, targetId)) continue;
    if (!isActive(m, s, now)) continue;
    if (m.type === "add") add = add.add(m.value);
    else mult = mult.mul(m.value);
  }
  return { add, mult };
}

/**
 * 단일 generator 의 초당 생산량.
 *   rate = (baseRate × count + Σadd:generatorRate) × Πmult:generatorRate
 * unlock 안 된 generator 는 0.
 */
export function generatorRate(s: GameState, g: Generator, now: number): Decimal {
  if (!g.unlocked) return new Decimal(0);
  const base = g.baseRate.mul(g.count);
  const { add, mult } = collect(s, now, "generatorRate", g.id);
  return base.add(add).mul(mult);
}

/**
 * 특정 resource 의 초당 총 생산량.
 *   total = (Σ generatorRate(produces=resource) + Σadd:globalRate) × Πmult:globalRate
 */
export function resourceRate(s: GameState, resourceId: string, now: number): Decimal {
  let sum = new Decimal(0);
  for (const g of Object.values(s.generators)) {
    if (g.produces === resourceId) sum = sum.add(generatorRate(s, g, now));
  }
  const { add, mult } = collect(s, now, "globalRate", resourceId);
  // 생태계 건강도(뿌리노드→미터) 를 마지막 배수로. 무너진 몸은 자원을 못 만든다.
  return sum.add(add).mul(mult).mul(meterHealthMult(s));
}

/**
 * cost scope modifier 적용: 최종 비용 = (base + Σadd:cost) × Πmult:cost.
 * (할인은 mult < 1, 할증은 mult > 1)
 */
export function applyCostModifiers(
  s: GameState,
  resourceId: string,
  baseCost: Decimal,
  now: number
): Decimal {
  const { add, mult } = collect(s, now, "cost", resourceId);
  const c = baseCost.add(add).mul(mult);
  return c.lt(0) ? new Decimal(0) : c;
}

/**
 * offlinePayout scope multiplier (광고 ×N 등). 기본 1.
 */
export function offlineMultiplier(s: GameState, resourceId: string, now: number): Decimal {
  const { add, mult } = collect(s, now, "offlinePayout", resourceId);
  // offline 은 add 를 "보너스 배수 가산" 대신 순수 배수로만 쓰는 게 직관적이라 mult 만 사용.
  // add 가 있으면 (1 + add) 형태로 함께 반영.
  return mult.mul(new Decimal(1).add(add));
}
