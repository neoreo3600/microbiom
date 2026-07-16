// engine/actions.ts
// 상태를 변화시키는 순수 액션들.
// 게임의 모든 "기능"은 결국 여기서 Modifier 를 생성하거나, Modifier 를 낳는 전환을 수행한다.
// 이 파일은 content 데이터를 인자로 받을 뿐, content 를 import 하지 않는다. (독립)

import Decimal from "break_infinity.js";
import { computeCost } from "./cost";
import { applyCostModifiers } from "./modifiers";
import {
  addBalance,
  getBalance,
  type GameState,
  type Generator,
  type Modifier,
  type MutationDef,
  type UnitDef,
  type Upgrade,
} from "./state";

/** grants 템플릿 + id/source 를 합쳐 실제 Modifier 인스턴스로 만든다. */
function instantiate(
  grants: Omit<Modifier, "id" | "source">,
  id: string,
  source: string
): Modifier {
  return { ...grants, id, source };
}

/** 다음 구매 실비용 (cost modifier 반영). */
export function nextCost(s: GameState, up: Upgrade, now: number): Decimal {
  const raw = computeCost(up.cost, up.level);
  return applyCostModifiers(s, up.costResource, raw, now);
}

/**
 * 업그레이드 구매 (구매형 Modifier).
 * EP 업그레이드든 genes 영구 트리든 동일 경로. source 는 호출자가 지정.
 * 성공 시 grants 를 새 modifier 인스턴스로 push (레벨마다 스택).
 */
export function buyUpgrade(
  s: GameState,
  up: Upgrade,
  source: string,
  now: number
): boolean {
  if (up.maxLevel !== undefined && up.level >= up.maxLevel) return false;
  const cost = nextCost(s, up, now);
  if (getBalance(s, up.costResource).lt(cost)) return false;

  addBalance(s, up.costResource, cost.neg());
  up.level += 1;
  s.modifiers.push(
    instantiate(up.grants, `${source}#${up.level}`, source)
  );
  return true;
}

/**
 * 진화 (Generator tier 상승).
 * tier 증가 → 큰 mult modifier 부여 + 다음 tier 해금 준비.
 * cost 는 exp 곡선(evolveCost)을 tier 지수로 평가.
 */
export function evolve(
  s: GameState,
  g: Generator,
  evolveCost: { type: "exp" | "lin" | "poly"; base: Decimal; ratio: Decimal },
  tierMult: Decimal,
  costResource: string,
  now: number
): boolean {
  if (g.tier >= g.maxTier) return false;
  const raw = computeCost(evolveCost, g.tier); // tier 1 → n=1 비용으로 tier 2 진입
  const cost = applyCostModifiers(s, costResource, raw, now);
  if (getBalance(s, costResource).lt(cost)) return false;

  addBalance(s, costResource, cost.neg());
  g.tier += 1;
  s.modifiers.push({
    id: `tier:${g.id}:${g.tier}`,
    source: `tier:${g.id}`,
    scope: "generatorRate",
    target: g.id,
    type: "mult",
    value: tierMult,
  });
  return true;
}

/** 가중치 기반 랜덤 인덱스 선택. rng: [0,1) */
function weightedPick<T extends { weight: number }>(defs: T[], rng: number): T {
  const total = defs.reduce((a, d) => a + d.weight, 0);
  let r = rng * total;
  for (const d of defs) {
    r -= d.weight;
    if (r < 0) return d;
  }
  return defs[defs.length - 1];
}

/**
 * 돌연변이 뽑기 (랜덤 영구 Modifier + 수집 플래그).
 * 중복 뽑기도 스택되도록 획득 횟수로 id 를 구분.
 */
export function drawMutation(
  s: GameState,
  pool: MutationDef[],
  rng: number
): MutationDef {
  const def = weightedPick(pool, rng);
  // 같은 mutation 을 몇 번째 뽑았는지로 고유 id 부여 (중복 스택 허용)
  const owned = s.modifiers.filter((m) => m.source === `mutation:${def.id}`).length;
  s.modifiers.push(
    instantiate(def.grants, `mutation:${def.id}#${owned + 1}`, `mutation:${def.id}`)
  );
  s.collection.add(def.id);
  return def;
}

/**
 * 히어로 유닛 뽑기 (유익균·Treg 등). 보유 수만큼 grants modifier 가 스택된다.
 * source `unit:<id>`, collection 엔 `unit:<id>` 로 네임스페이스.
 */
export function drawUnit(s: GameState, pool: UnitDef[], rng: number): UnitDef {
  const def = weightedPick(pool, rng);
  const owned = s.modifiers.filter((m) => m.source === `unit:${def.id}`).length;
  s.modifiers.push(
    instantiate(def.grants, `unit:${def.id}#${owned + 1}`, `unit:${def.id}`)
  );
  s.collection.add(`unit:${def.id}`);
  return def;
}

/** 특정 유닛의 보유 수 (source 개수로 파생) */
export function unitCount(s: GameState, id: string): number {
  return s.modifiers.filter((m) => m.source === `unit:${id}`).length;
}

/**
 * 임시 부스터 활성화 (expiresAt 있는 Modifier).
 * 이미 같은 부스터가 있으면 만료시간 갱신(중첩 방지).
 */
export function activateBooster(
  s: GameState,
  booster: { id: string; grants: Omit<Modifier, "id" | "source">; durationSec: number },
  now: number
): void {
  const source = `booster:${booster.id}`;
  const expiresAt = now + booster.durationSec * 1000;
  const existing = s.modifiers.find((m) => m.source === source);
  if (existing) {
    existing.expiresAt = expiresAt;
    return;
  }
  s.modifiers.push({
    ...instantiate(booster.grants, source, source),
    expiresAt,
  });
}
