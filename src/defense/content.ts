// defense/content.ts
// 《내몸을 지켜라》 데이터. 세포 합체 트리 · 미생물 성벽 · 적(유해균/질병세포) · 웨이브.
// 엔진은 이 데이터를 config 로 받아 동작한다(순수). 밸런스는 여기 상수만 바꾼다.

import type { CellDef, EnemyDef, DefenseConfig } from "./engine";

// 면역세포 합체 트리 (index 0 = tier1). 합치면 다음 티어.
export const CELL_TIERS: CellDef[] = [
  { tier: 1, name: "호중구", hue: 205, hp: 36, atk: 6, rate: 1.3, range: 3.2 },
  { tier: 2, name: "대식세포", hue: 150, hp: 120, atk: 13, rate: 1.0, range: 3.2 },
  { tier: 3, name: "T세포", hue: 275, hp: 95, atk: 27, rate: 1.45, range: 4.2 },
  { tier: 4, name: "NK세포", hue: 340, hp: 160, atk: 62, rate: 1.7, range: 5.2 },
];

// 적 정의 (speed = 칸/초)
export const ENEMY_DEFS: Record<string, EnemyDef> = {
  badbac: { type: "badbac", name: "유해균", hue: 95, hp: 34, speed: 0.55, atk: 8, bounty: 3, radius: 0.30 },
  inflam: { type: "inflam", name: "염증세포", hue: 22, hp: 60, speed: 0.72, atk: 11, bounty: 4, radius: 0.32 },
  boss_cancer: { type: "boss_cancer", name: "암세포", hue: 288, hp: 950, speed: 0.26, atk: 34, bounty: 70, radius: 0.6, boss: true },
};

// 웨이브: 각 원소가 한 웨이브. 스폰 리스트(타입·개수·간격초).
export const WAVES: DefenseConfig["waves"] = [
  [{ type: "badbac", n: 6, gap: 0.9 }],
  [{ type: "badbac", n: 7, gap: 0.7 }, { type: "inflam", n: 4, gap: 1.1 }],
  [{ type: "inflam", n: 9, gap: 0.6 }, { type: "badbac", n: 6, gap: 0.5 }],
  [{ type: "badbac", n: 8, gap: 0.5 }, { type: "boss_cancer", n: 1, gap: 0 }, { type: "inflam", n: 6, gap: 0.9 }],
];

export const DEFENSE_CONFIG: DefenseConfig = {
  tiers: CELL_TIERS,
  enemies: ENEMY_DEFS,
  waves: WAVES,
  wallHp: 320,
  wallCost: 35,
  t1Cost: 20,
  coreHp: 100,
  energyStart: 60,
  energyRegen: 9, // 초당
  intermissionSec: 3,
};
