// content/config.ts
// 데이터 주도 콘텐츠. 엔진 코드를 건드리지 않고 여기만 수정해 콘텐츠를 추가/변경한다.
// (수용기준 1: 새 tier/업그레이드/돌연변이 추가 시 engine 변경 0줄)
//
// 숫자는 "완벽한 밸런스"가 아니라 곡선을 관찰·튜닝할 출발점이다.

import Decimal from "break_infinity.js";
import type {
  CostCurve,
  GameState,
  Generator,
  Modifier,
  MutationDef,
  PrestigeLayer,
  Resource,
  Upgrade,
} from "../engine/state";
import type { InitialSnapshot } from "../engine/prestige";

const D = (v: number | string) => new Decimal(v);

// ─────────────────────────────────────────────────────────────
// 자원
// ─────────────────────────────────────────────────────────────
export const RESOURCE_IDS = {
  EP: "EP", // Evolution Points — 주 자원
} as const;

export const PRESTIGE_CURRENCY = "genes";

// ─────────────────────────────────────────────────────────────
// Generator + 진화(tier) 정의
// ─────────────────────────────────────────────────────────────
export const MAIN_GENERATOR_ID = "microbe";

/** 진화 = generator.tier 상승. tier 당 ×TIER_MULT, 비용은 exp 곡선. */
export const TIER = {
  maxTier: 6,
  mult: D(8), // 진화 1회당 생산 ×8
  cost: { type: "exp", base: D(100), ratio: D(14) } as CostCurve, // tier n 진입 비용 = 100×14^n
};

// ─────────────────────────────────────────────────────────────
// 업그레이드 (EP 로 사는 구매형 Modifier)
// ─────────────────────────────────────────────────────────────
export const UPGRADES: Upgrade[] = [
  {
    id: "metabolism",
    costResource: RESOURCE_IDS.EP,
    cost: { type: "exp", base: D(50), ratio: D(3) },
    level: 0,
    maxLevel: 25,
    grants: { scope: "generatorRate", target: MAIN_GENERATOR_ID, type: "mult", value: D(2) },
  },
  {
    id: "enzyme", // additive: 초당 고정 생산 가산
    costResource: RESOURCE_IDS.EP,
    cost: { type: "exp", base: D(500), ratio: D(4) },
    level: 0,
    maxLevel: 15,
    grants: { scope: "generatorRate", target: MAIN_GENERATOR_ID, type: "add", value: D(5) },
  },
  {
    id: "division",
    costResource: RESOURCE_IDS.EP,
    cost: { type: "exp", base: D(2000), ratio: D(2.6) },
    level: 0,
    grants: { scope: "globalRate", target: "*", type: "mult", value: D(1.5) },
  },
  {
    id: "symbiosis",
    costResource: RESOURCE_IDS.EP,
    cost: { type: "exp", base: D(1e5), ratio: D(6) },
    level: 0,
    maxLevel: 10,
    grants: { scope: "globalRate", target: "*", type: "mult", value: D(3) },
  },
];

// ─────────────────────────────────────────────────────────────
// 돌연변이 풀 (가챠) — rarity 별 weight, 영구 mult, collection flag
// ─────────────────────────────────────────────────────────────
export const MUTATIONS: MutationDef[] = [
  { id: "fastsplit", rarity: "common", weight: 40, grants: { scope: "generatorRate", target: "*", type: "mult", value: D(1.1) } },
  { id: "thickwall", rarity: "common", weight: 40, grants: { scope: "globalRate", target: "*", type: "mult", value: D(1.1) } },
  { id: "flagella", rarity: "common", weight: 30, grants: { scope: "generatorRate", target: MAIN_GENERATOR_ID, type: "mult", value: D(1.15) } },
  { id: "photosynth", rarity: "rare", weight: 15, grants: { scope: "globalRate", target: "*", type: "mult", value: D(1.5) } },
  { id: "chemotroph", rarity: "rare", weight: 15, grants: { scope: "generatorRate", target: MAIN_GENERATOR_ID, type: "mult", value: D(1.6) } },
  { id: "bioluminescence", rarity: "rare", weight: 12, grants: { scope: "globalRate", target: "*", type: "mult", value: D(1.75) } },
  { id: "extremophile", rarity: "epic", weight: 6, grants: { scope: "globalRate", target: "*", type: "mult", value: D(2.5) } },
  { id: "endosymbiont", rarity: "epic", weight: 5, grants: { scope: "generatorRate", target: MAIN_GENERATOR_ID, type: "mult", value: D(3) } },
  { id: "apexstrain", rarity: "legendary", weight: 2, grants: { scope: "globalRate", target: "*", type: "mult", value: D(6) } },
  { id: "immortalline", rarity: "legendary", weight: 1, grants: { scope: "globalRate", target: "*", type: "mult", value: D(10) } },
];

const RARITY_RANK: Record<MutationDef["rarity"], number> = {
  common: 0,
  rare: 1,
  epic: 2,
  legendary: 3,
};

/** rare 이상 등급의 id 집합 (세트보너스 조건 계산용) */
const RAREPLUS_IDS = new Set(
  MUTATIONS.filter((m) => RARITY_RANK[m.rarity] >= 1).map((m) => m.id)
);

/** 도감 세트보너스: rare+ 를 SET_THRESHOLD 종 이상 수집하면 활성화되는 조건부 modifier */
export const SET_THRESHOLD = 3;

function rarePlusCollected(s: GameState): number {
  let n = 0;
  for (const id of s.collection) if (RAREPLUS_IDS.has(id)) n++;
  return n;
}

// ─────────────────────────────────────────────────────────────
// condition 레지스트리 — save 로드 시 조건부 modifier 에 함수 재부착
//   (key = modifier.id)
// ─────────────────────────────────────────────────────────────
export const SET_BONUS_ID = "setBonus:rareCollector";

export const CONDITIONS: Record<string, (s: GameState) => boolean> = {
  [SET_BONUS_ID]: (s) => rarePlusCollected(s) >= SET_THRESHOLD,
};

/** save 로드 시 modifier.id 로 condition 함수를 되찾는다. */
export function reattachCondition(m: Modifier): ((s: GameState) => boolean) | undefined {
  return CONDITIONS[m.id];
}

// ─────────────────────────────────────────────────────────────
// 임시 부스터 (광고 스텁) — expiresAt 있는 mult modifier
// ─────────────────────────────────────────────────────────────
export interface BoosterDef {
  id: string;
  label: string;
  durationSec: number;
  grants: Omit<Modifier, "id" | "source">;
}

export const BOOSTERS: BoosterDef[] = [
  {
    id: "adrenaline",
    label: "EP ×2 (180s)",
    durationSec: 180,
    grants: { scope: "globalRate", target: RESOURCE_IDS.EP, type: "mult", value: D(2) },
  },
  {
    id: "frenzy",
    label: "microbe ×5 (60s)",
    durationSec: 60,
    grants: { scope: "generatorRate", target: MAIN_GENERATOR_ID, type: "mult", value: D(5) },
  },
];

// ─────────────────────────────────────────────────────────────
// 오프라인 광고 ×N 스텁 — offlinePayout scope 임시 modifier
// ─────────────────────────────────────────────────────────────
export const OFFLINE_CAP_SEC = 4 * 3600; // 오프라인 보상 상한 4시간
export const OFFLINE_AD = {
  id: "offlineAd",
  durationSec: 30, // 30초 안에 +Nh 스킵을 누르면 보상 ×N 적용
  grants: { scope: "offlinePayout", target: "*", type: "mult", value: D(2) } as Omit<Modifier, "id" | "source">,
};

// ─────────────────────────────────────────────────────────────
// 프레스티지 레이어 (환생)
// ─────────────────────────────────────────────────────────────
const PRESTIGE_K = 1e6; // gain = floor(sqrt(lifetimeEP / K))

export const PRESTIGE: PrestigeLayer = {
  id: "genesis",
  currency: PRESTIGE_CURRENCY,
  // resetScope: EP·generator 되돌리고 EP 계열 modifier 제거.
  //   mutation(도감)·prestige(영구트리)·setBonus 는 유지된다.
  resetScope: ["resources", "generators", "upgrade:", "tier:", "booster:"],
  gainFormula: (s) => {
    const lifeEP = s.lifetime[RESOURCE_IDS.EP] ?? D(0);
    return lifeEP.div(PRESTIGE_K).sqrt().floor();
  },
  permanentUpgrades: [
    {
      id: "core",
      costResource: PRESTIGE_CURRENCY,
      cost: { type: "exp", base: D(1), ratio: D(3) },
      level: 0,
      maxLevel: 20,
      grants: { scope: "globalRate", target: "*", type: "mult", value: D(2) },
    },
    {
      id: "replicate",
      costResource: PRESTIGE_CURRENCY,
      cost: { type: "exp", base: D(2), ratio: D(2) },
      level: 0,
      grants: { scope: "generatorRate", target: "*", type: "mult", value: D(1.5) },
    },
    {
      id: "flux",
      costResource: PRESTIGE_CURRENCY,
      cost: { type: "exp", base: D(5), ratio: D(4) },
      level: 0,
      maxLevel: 10,
      grants: { scope: "generatorRate", target: MAIN_GENERATOR_ID, type: "add", value: D(1000) },
    },
  ],
};

// ─────────────────────────────────────────────────────────────
// 초기 상태 생성 + 초기 스냅샷 (환생 되돌림 기준)
// ─────────────────────────────────────────────────────────────
export function createInitialState(now: number): GameState {
  const resources: Record<string, Resource> = {
    [RESOURCE_IDS.EP]: { id: RESOURCE_IDS.EP, amount: D(0) },
  };

  const generators: Record<string, Generator> = {
    [MAIN_GENERATOR_ID]: {
      id: MAIN_GENERATOR_ID,
      produces: RESOURCE_IDS.EP,
      baseRate: D(1), // tier1·count1 → 1 EP/s
      count: D(1),
      tier: 1,
      maxTier: TIER.maxTier,
      unlocked: true,
    },
  };

  // 조건부 세트보너스 modifier 는 초기부터 상태에 존재(조건 미충족 시 비활성)
  const modifiers: Modifier[] = [
    {
      id: SET_BONUS_ID,
      source: "setBonus:rareCollector",
      scope: "globalRate",
      target: "*",
      type: "mult",
      value: D(2),
      condition: CONDITIONS[SET_BONUS_ID],
    },
  ];

  return {
    resources,
    generators,
    modifiers,
    // 4대 미터 — 무너진 상태에서 시작하지 않고 중립(0.5)에서 출발 (보스전 진입 시 boss.startMeters 로 덮어씀)
    meters: { gut: 0.5, water: 0.5, warmth: 0.5, mind: 0.5 },
    inflammation: 0,
    detox: 0,
    // 뿌리노드(마이크로바이옴) — diversity 가 내구도. 초반은 취약한 숙주라 낮게 출발.
    rootnode: {
      diversity: 0.3,
      outputs: { immune: 0.3, neuro: 0.3, scfa: 0.3, detox: 0.3 },
    },
    collection: new Set<string>(),
    prestige: { migrations: 0, genes: {} },
    lifetime: {},
    lastSeenAt: now,
  };
}

/** 환생 시 되돌릴 초기 스냅샷 (resource amount / generator 상태). */
export function initialSnapshot(): InitialSnapshot {
  return {
    resourceAmount: { [RESOURCE_IDS.EP]: D(0) },
    generator: {
      [MAIN_GENERATOR_ID]: { count: D(1), tier: 1, unlocked: true },
    },
  };
}
