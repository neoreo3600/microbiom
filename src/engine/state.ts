// engine/state.ts
// GameState 타입 정의 + 잔액(balance) 헬퍼.
// engine/ 은 content/ 와 debug/ 에 의존하지 않는다. (순수 로직)
//
// 《속나라》 도메인 확장: 4대 미터(숲·물길·온기·빛) + 염증/해독 + 뿌리노드(마이크로바이옴)
// + 오행 월드 + 보스(질병) 타입. 명명 표준(핸드오프 스펙 §1): gut/water/warmth/mind = 숲/물길/온기/빛.

import Decimal from "break_infinity.js";

// ─────────────────────────────────────────────────────────────
// 프리미티브 타입
// ─────────────────────────────────────────────────────────────

export type ModType = "add" | "mult";
// "meter" 추가: 미터(숲·물길·온기·빛)에 직접 작용하는 modifier scope
export type ModScope = "generatorRate" | "globalRate" | "cost" | "offlinePayout" | "meter";

/** 4대 조작 미터 키 (표면: 숲/물길/온기/빛) */
export type MeterKey = "gut" | "water" | "warmth" | "mind";
export const METER_KEYS: MeterKey[] = ["gut", "water", "warmth", "mind"];

/** 오행 + 상화 */
export type Element = "wood" | "fire" | "earth" | "metal" | "water5" | "ministerfire";

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

/** 3. Modifier — 생산율/비용/오프라인보상/미터에 작용하는 유일한 레버 */
export interface Modifier {
  id: string;
  source: string; // "upgrade:x" | "mutation:y" | "prestige:z" | "booster:b" | "setBonus:s" | "tier:t" | "rootnode" ...
  scope: ModScope;
  target?: string; // resource/generator/meter id, 또는 "*"(글로벌)
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

// ─────────────────────────────────────────────────────────────
// 《속나라》 도메인 타입 (§4)
// ─────────────────────────────────────────────────────────────

/** 상류: 뿌리노드(마이크로바이옴) — 전 게임 상시 작동, diversity 가 내구도=방어력 */
export interface RootNode {
  diversity: number; // 0..1  내구도 = 방어력
  outputs: {
    immune: number; // 면역력 (NK·T 감시)
    neuro: number; // 신경전달 (식 상한 해제)
    scfa: number; // SCFA (부티레이트 등)
    detox: number; // 해독·염증방어
  };
}

/** 오행 월드 (무대 = 대상 오장육부) */
export interface World {
  id: string;
  element: Element;
  organ: string; // 대상 오장육부
  emotion: string; // 빌런 감정 (mind 전환 대상)
  tasteResource: string; // 오미 (회복 자원)
  governedTissue: string; // 주관 조직 (증상 스킨)
}

/** 질병 고유 게이지 (혈당/면역과활성/색채/종양…) — 데이터로 기술 */
export interface DiseaseGauge {
  id: string;
  behavior: "fill" | "drain" | "stealthGrow";
  drivers: string[];
  overflow: string;
}

/** 페이즈 진입 조건식 (데이터로 기술) */
export interface Gate {
  requires: string;
}

/** 승리 조건 — 항상성 밴드 */
export interface VictoryCond {
  band: string;
  meters: number; // 모든 미터가 이 값 이상
  inflammationMax: number;
  extra?: string;
}

/** 보스(질병) */
export interface Boss {
  id: string;
  disease: string;
  world: string;
  organ: string;
  emotion: string; // 빌런 감정(mind 전환 대상)
  tasteResource: string; // 오미(회복 자원)
  startMeters: Record<MeterKey, number>; // 0..1
  detoxBurden: "low" | "mid" | "high";
  inflammation: { value: number; regen: number }; // 크로스-빌런
  gauge?: DiseaseGauge; // 질병 고유 게이지
  paradox?: string; // 예: 공격=자해, 긍정강요=무효
  phases: { circulation: Gate; purification: Gate; regeneration: Gate };
  victory: VictoryCond; // 항상성 밴드
  archetype?: string; // cancer_base 등 상속
}

// ─────────────────────────────────────────────────────────────
// 게임 상태 전체 (직렬화 대상)
// ─────────────────────────────────────────────────────────────
export interface GameState {
  resources: Record<string, Resource>;
  generators: Record<string, Generator>;
  modifiers: Modifier[]; // 영구 + 임시 전부 여기 한 곳
  meters: Record<MeterKey, number>; // 숲/물길/온기/빛 (0..1)
  inflammation: number; // 오염 (크로스-빌런)
  detox: number; // 해독 부담
  rootnode: RootNode; // 마이크로바이옴 뿌리노드
  collection: Set<string>; // 획득한 mutation id
  prestige: { migrations: number; genes: Record<string, Decimal> }; // 이주 횟수 + 영구 통화
  lifetime: Record<string, Decimal>; // 누적 통계 (환생 변환식 입력)
  lastSeenAt: number;
}

// ─────────────────────────────────────────────────────────────
// 잔액 헬퍼 — resources 와 prestige.genes 를 통합 조회/증감
//   (EP 는 resource, genes 는 prestige.genes 에 있음)
// ─────────────────────────────────────────────────────────────

export function getBalance(s: GameState, id: string): Decimal {
  if (s.resources[id]) return s.resources[id].amount;
  if (s.prestige.genes[id]) return s.prestige.genes[id];
  return new Decimal(0);
}

export function addBalance(s: GameState, id: string, delta: Decimal): void {
  if (s.resources[id]) {
    s.resources[id].amount = s.resources[id].amount.add(delta);
    return;
  }
  const cur = s.prestige.genes[id] ?? new Decimal(0);
  s.prestige.genes[id] = cur.add(delta);
}

/** lifetime 통계 누적 */
export function addLifetime(s: GameState, id: string, delta: Decimal): void {
  const cur = s.lifetime[id] ?? new Decimal(0);
  s.lifetime[id] = cur.add(delta);
}

/** 미터 값 clamp 헬퍼 (0..1) */
export function clampMeter(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
