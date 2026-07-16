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

/** 히어로 유닛 (유익균·Treg 등) — 뽑아 배치하면 지속 지지 Modifier 소스가 된다. */
export interface UnitDef {
  id: string;
  name: string;
  rarity: "common" | "rare" | "epic" | "legendary";
  weight: number; // 뽑기 가중치
  role: string; // 역할 설명
  tags?: string[]; // 특히 유효한 보스/월드 id
  grants: Omit<Modifier, "id" | "source">; // 보유 1당 부여되는 modifier (스택)
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
  fill?: number; // 초당 기본 변화량 (튜닝)
  stableBand?: number; // 승리 판정용 안정 상한 (튜닝)
  start?: number; // 시작 게이지 값 (기본 0). 암=이미 존재하는 종양
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
  // ── 게임 튜닝(선택) ──
  heatPolarity?: number; // 순환 시 온기 방향: +1 보(당뇨) / -1 사·淸熱(자가면역)
  attackRaisesGauge?: number; // 공격(딜) 시 게이지 상승량 — 역설 보스(자가면역)
  debuffs?: Omit<Modifier, "id" | "source">[]; // 시작 시 부여되는 디버프(인슐린저항 등)
  clearReward?: Omit<Modifier, "id" | "source">; // 승리 시 부여되는 영구 '치유 지혜' 배지 (이주해도 유지)
  // 식(識) 잠금 — 지반(장·수·열 평균, 염증)이 임계 넘기 전엔 빛(mind)에 cap. "몸을 고쳐야 마음이 열린다"(우울)
  mindLock?: { foundationMeters: number; foundationInflammation: number; cap: number };
}

/** 보스전 페이즈 (순환→정화→재생→승리) */
export type PhaseKey = "circulation" | "purification" | "regeneration" | "won";

/**
 * 보스 인카운터 진행 상태 (연속 시뮬레이션 대상).
 * Boss config 로부터 시작 시 채워지고, 틱마다 게이지/염증이 굴러간다.
 */
export interface Encounter {
  bossId: string;
  disease: string;
  world: string;
  emotion: string; // 빛(mind) 전환 대상
  phase: PhaseKey;
  gauge: number; // 질병 고유 게이지 (혈당/면역과활성/색채…). overflow 는 >1
  gaugeLabel: string;
  gaugeBehavior: "fill" | "drain" | "stealthGrow";
  gaugeFill: number; // 초당 기본 변화량
  gaugeStableBand: number; // 승리 판정용 게이지 안정 상한
  inflammationRegen: number; // 이 보스의 염증 self-regen (per sec)
  detoxInflow: number; // 이 보스의 해독 부담 유입 (per sec)
  heatPolarity: number; // 순환 시 온기 방향 (+1 보 / -1 사)
  attackRaisesGauge: number; // 공격 시 게이지 상승 (역설)
  relapseResist: number; // 클리어 후 재발 저항 (0..1)
  paradox?: string;
  // 페이즈 게이트식(데이터) & 승리 밴드 — 엔진이 content 없이 자체 평가
  gates: { circulation: string; purification: string; regeneration: string };
  victory: { meters: number; inflammationMax: number };
  mindLock?: { foundationMeters: number; foundationInflammation: number; cap: number };
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
  encounter?: Encounter; // 현재 보스전 진행 상태 (없으면 자유 성장 모드)
  campaign: { hostIndex: number }; // 현재 돌보는 숙주 인덱스 (이주 루프)
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

/** 4미터 평균 (생태계 건강도) */
export function meterAverage(s: GameState): number {
  return METER_KEYS.reduce((a, k) => a + s.meters[k], 0) / METER_KEYS.length;
}

/**
 * 미터 평균 건강도 → 생산 배수. 생태계가 건강할수록 자원 생산이 늘어난다.
 * (뿌리노드 → 미터 → 생산 으로 이어지는 사슬의 마지막 고리)
 * 하한 0.1 로 완전 붕괴여도 최소 생산은 유지.
 */
export function meterHealthMult(s: GameState): number {
  return Math.max(0.1, meterAverage(s));
}
