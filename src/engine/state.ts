// engine/state.ts
// GameState 타입 정의 + 잔액(balance) 헬퍼.
// engine/ 은 content/ 와 debug/ 에 의존하지 않는다. (순수 로직)

import Decimal from "break_infinity.js";

// ─────────────────────────────────────────────────────────────
// 프리미티브 타입
// ─────────────────────────────────────────────────────────────

export type ModType = "add" | "mult";
export type ModScope = "generatorRate" | "globalRate" | "cost" | "offlinePayout";

/** 1. Resource — 누적되는 수량 */
export interface Resource {
  id: string;
  amount: Decimal;
}

/** 2. Generator — 시간당 Resource 를 생산하는 주체 */
export interface Generator {
  id: string;
  produces: string; // resource id
  baseRate: Decimal; // count=1, tier=1 기준 초당 생산
  count: Decimal; // 소유 수
  tier: number; // 진화 단계
  maxTier: number; // 진화 상한 (content 가 정함)
  unlockAt?: { resource: string; amount: Decimal };
  unlocked: boolean;
}

/** 3. Modifier — 생산율/비용/오프라인보상에 작용하는 유일한 레버 */
export interface Modifier {
  id: string;
  source: string; // "upgrade:x" | "mutation:y" | "prestige:z" | "booster:b" | "setBonus:s" | "tier:t"
  scope: ModScope;
  target?: string; // resource/generator id, 또는 "*"(글로벌)
  type: ModType;
  value: Decimal; // mult=2 → ×2, add=0.5 → +0.5
  expiresAt?: number; // epoch ms (임시). 없으면 영구
  condition?: (s: GameState) => boolean; // 조건부(세트보너스 등). 직렬화 대상 아님.
}

/** 4. CostCurve — "다음 구매 비용" 함수 */
export interface CostCurve {
  type: "exp" | "lin" | "poly";
  base: Decimal;
  ratio: Decimal; // exp: base*ratio^n, lin: base+ratio*n, poly: base*n^ratio
}

export interface Upgrade {
  id: string;
  cost: CostCurve;
  costResource: string;
  level: number;
  maxLevel?: number;
  grants: Omit<Modifier, "id" | "source">; // 구매 시 부여될 modifier 템플릿
}

export interface MutationDef {
  id: string;
  rarity: "common" | "rare" | "epic" | "legendary";
  weight: number; // 뽑기 가중치
  grants: Omit<Modifier, "id" | "source">;
}

export interface PrestigeLayer {
  id: string;
  resetScope: string[]; // 초기화할 상태 키 / modifier source prefix
  currency: string; // 예: "genes"
  gainFormula: (s: GameState) => Decimal; // 예: floor(sqrt(lifetimeEP / K))
  permanentUpgrades: Upgrade[]; // currency 로 사는 영구 트리
}

/** 게임 상태 전체 (직렬화 대상) */
export interface GameState {
  resources: Record<string, Resource>;
  generators: Record<string, Generator>;
  modifiers: Modifier[]; // 영구 + 임시 전부 여기 한 곳
  collection: Set<string>; // 획득한 mutation id
  prestige: { count: number; currency: Record<string, Decimal> };
  lifetime: Record<string, Decimal>; // 누적 통계 (환생 변환식 입력)
  lastSeenAt: number;
}

// ─────────────────────────────────────────────────────────────
// 잔액 헬퍼 — resources 와 prestige.currency 를 통합 조회/증감
//   (EP 는 resource, genes 는 prestige.currency 에 있음)
// ─────────────────────────────────────────────────────────────

export function getBalance(s: GameState, id: string): Decimal {
  if (s.resources[id]) return s.resources[id].amount;
  if (s.prestige.currency[id]) return s.prestige.currency[id];
  return new Decimal(0);
}

export function addBalance(s: GameState, id: string, delta: Decimal): void {
  if (s.resources[id]) {
    s.resources[id].amount = s.resources[id].amount.add(delta);
    return;
  }
  const cur = s.prestige.currency[id] ?? new Decimal(0);
  s.prestige.currency[id] = cur.add(delta);
}

/** lifetime 통계 누적 */
export function addLifetime(s: GameState, id: string, delta: Decimal): void {
  const cur = s.lifetime[id] ?? new Decimal(0);
  s.lifetime[id] = cur.add(delta);
}
