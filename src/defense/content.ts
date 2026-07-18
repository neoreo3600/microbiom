// defense/content.ts
// 《내몸을 지켜라》 데이터. 세포 합체 트리 · 미생물 성벽 · 적(유해균/질병세포) · 웨이브.
// 엔진은 이 데이터를 config 로 받아 동작한다(순수). 밸런스는 여기 상수만 바꾼다.

import type { CellDef, EnemyDef, DefenseConfig, OrganTrait } from "./engine";

// 장기 아레나 — 배경 팔레트 + 특성(패시브). 웨이브마다 다른 장기.
export const ORGANS = ["gut", "liver", "lung", "heart"] as const;
export type OrganKey = (typeof ORGANS)[number];
export const ORGAN_INFO: Record<OrganKey, { name: string; h: number; s: number; trait: string }> = {
  gut: { name: "장(腸)", h: 344, s: 40, trait: "🍚 영양 흡수 · 에너지 재생 +50%" },
  liver: { name: "간(肝)", h: 14, s: 46, trait: "⚗️ 해독 · 처치 보상 +60%" },
  lung: { name: "폐(肺)", h: 318, s: 28, trait: "🫁 산소 공급 · 사거리 +1" },
  heart: { name: "심장(心)", h: 2, s: 50, trait: "💗 순환 · 공격속도 +25%" },
};
// engine 이 wave % len 으로 참조 (ORGANS 순서와 일치)
export const ORGAN_TRAITS: OrganTrait[] = [
  { regenMul: 1.5, bountyMul: 1, rangeBonus: 0, rateMul: 1 },   // gut
  { regenMul: 1, bountyMul: 1.6, rangeBonus: 0, rateMul: 1 },   // liver
  { regenMul: 1, bountyMul: 1, rangeBonus: 1, rateMul: 1 },     // lung
  { regenMul: 1, bountyMul: 1, rangeBonus: 0, rateMul: 0.8 },   // heart
];

// 웨이브 사이 강화 상점 (면역 포인트 IP 로 구매, 이번 판 지속)
export interface ShopItem { id: string; name: string; desc: string; icon: string; baseCost: number; costStep: number; }
export const SHOP: ShopItem[] = [
  { id: "dmg", name: "공격 강화", desc: "모든 세포 공격력 +15%", icon: "💥", baseCost: 6, costStep: 5 },
  { id: "regen", name: "대사 촉진", desc: "에너지 재생 +2/s", icon: "⚡", baseCost: 6, costStep: 5 },
  { id: "core", name: "거점 보강", desc: "거점 최대 HP +30 · 즉시 회복", icon: "❤️", baseCost: 8, costStep: 6 },
  { id: "marrow", name: "골수 이식", desc: "기지 빈칸에 호중구 자동 생성(강화 시 간격↓)", icon: "🦴", baseCost: 14, costStep: 10 },
];

// 면역세포 합체 트리 (index 0 = tier1). 합치면 다음 티어.
export const CELL_TIERS: CellDef[] = [
  { tier: 1, name: "호중구", hue: 205, hp: 36, atk: 6, rate: 1.3, range: 3.2 },
  { tier: 2, name: "대식세포", hue: 150, hp: 120, atk: 13, rate: 1.0, range: 3.2 },
  { tier: 3, name: "T세포", hue: 275, hp: 95, atk: 27, rate: 1.45, range: 4.2 },
  { tier: 4, name: "NK세포", hue: 340, hp: 160, atk: 62, rate: 1.7, range: 5.2 },
];

// 적 정의 (speed = 칸/초). 난이도 상향 — 더 두껍고 빠르고 많다.
export const ENEMY_DEFS: Record<string, EnemyDef> = {
  badbac: { type: "badbac", name: "유해균", hue: 95, hp: 52, speed: 0.62, atk: 10, bounty: 3, radius: 0.30 },
  virus: { type: "virus", name: "바이러스", hue: 62, hp: 26, speed: 1.15, atk: 7, bounty: 2, radius: 0.24 },
  inflam: { type: "inflam", name: "염증세포", hue: 22, hp: 100, speed: 0.78, atk: 15, bounty: 4, radius: 0.32 },
  boss_cancer: { type: "boss_cancer", name: "암세포", hue: 288, hp: 1500, speed: 0.28, atk: 45, bounty: 80, radius: 0.6, boss: true },
};

// 웨이브 캠페인(8) — 더 조밀·강력. 스폰(타입·개수·간격초).
export const WAVES: DefenseConfig["waves"] = [
  [{ type: "badbac", n: 8, gap: 0.75 }],
  [{ type: "badbac", n: 10, gap: 0.55 }],
  [{ type: "virus", n: 14, gap: 0.35 }],
  [{ type: "inflam", n: 8, gap: 0.7 }, { type: "badbac", n: 10, gap: 0.45 }],
  [{ type: "badbac", n: 12, gap: 0.4 }, { type: "boss_cancer", n: 1, gap: 0 }, { type: "virus", n: 12, gap: 0.35 }],
  [{ type: "virus", n: 18, gap: 0.25 }, { type: "inflam", n: 8, gap: 0.6 }],
  [{ type: "inflam", n: 14, gap: 0.45 }, { type: "badbac", n: 14, gap: 0.3 }],
  [{ type: "badbac", n: 8, gap: 0.4 }, { type: "boss_cancer", n: 2, gap: 6 }, { type: "inflam", n: 12, gap: 0.55 }],
];

export const DEFENSE_CONFIG: DefenseConfig = {
  tiers: CELL_TIERS,
  enemies: ENEMY_DEFS,
  waves: WAVES,
  organTraits: ORGAN_TRAITS,
  wallHp: 360,
  wallCost: 35,
  t1Cost: 20,
  coreHp: 100,
  energyStart: 60,
  energyRegen: 7.5, // 초당 (경제 타이트)
  intermissionSec: 3,
};

// 영웅 스킬 — 기존 히어로 유닛(마스코트 아트)을 액티브 스킬로 투입. unit = content/units.ts id.
export interface HeroSkill { id: string; unit: string; name: string; icon: string; cost: number; cd: number; effect: "nk" | "wall" | "heal" | "energy"; }
export const HERO_SKILLS: HeroSkill[] = [
  { id: "nk", unit: "nk", name: "NK 강타", icon: "💥", cost: 45, cd: 14, effect: "nk" },
  { id: "lacto", unit: "lacto", name: "방벽", icon: "🧱", cost: 35, cd: 16, effect: "wall" },
  { id: "treg", unit: "treg", name: "치유", icon: "💚", cost: 30, cd: 12, effect: "heal" },
  { id: "butyrate", unit: "butyrate", name: "충전", icon: "⚡", cost: 0, cd: 10, effect: "energy" },
];
