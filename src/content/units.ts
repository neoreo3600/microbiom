// content/units.ts
// 히어로 유닛(유익균·Treg 등) 데이터. 뽑아 배치하면 보유 수만큼 grants modifier 가 스택된다.
// 돌연변이(생산 강화)와 달리 유닛은 '전투 지원' — 미터 지지·감시·관용 등 보스전에 직접 작동.
// 엔진 변경 없이 여기에 유닛만 추가하면 된다. (이주해도 유지되는 영구 로스터)

import Decimal from "break_infinity.js";
import type { UnitDef } from "../engine/state";

const D = (v: number) => new Decimal(v);

export const UNITS: UnitDef[] = [
  // ── common ──
  { id: "lacto", name: "락토바실러스", rarity: "common", weight: 40, role: "장벽·SCFA 지지 (숲↑)",
    grants: { scope: "meter", target: "gut", type: "add", value: D(0.006) } },
  { id: "bifido", name: "비피도박테리움", rarity: "common", weight: 35, role: "전반 생산 강화",
    grants: { scope: "globalRate", target: "*", type: "mult", value: D(1.08) } },

  // ── rare ──
  { id: "akker", name: "아커만시아", rarity: "rare", weight: 15, role: "강력한 장벽 복구 (숲↑↑)", tags: ["diabetes_T2"],
    grants: { scope: "meter", target: "gut", type: "add", value: D(0.012) } },
  { id: "butyrate", name: "부티레이트 공장", rarity: "rare", weight: 15, role: "미토콘드리아 에너지 (생산↑)",
    grants: { scope: "generatorRate", target: "*", type: "mult", value: D(1.25) } },
  { id: "nk", name: "NK세포 순찰대", rarity: "rare", weight: 12, role: "종양 감시 (물길↑)", tags: ["colon_cancer"],
    grants: { scope: "meter", target: "water", type: "add", value: D(0.008) } },

  // ── epic ──
  { id: "treg", name: "조절T·평화유지군", rarity: "epic", weight: 6, role: "면역 관용·진정 (빛↑)", tags: ["autoimmune_RA"],
    grants: { scope: "meter", target: "mind", type: "add", value: D(0.01) } },
  { id: "psycho", name: "사이코바이오틱스", rarity: "epic", weight: 6, role: "세로토닌·파장 (빛↑)", tags: ["depression"],
    grants: { scope: "meter", target: "mind", type: "add", value: D(0.01) } },
  { id: "symbiont", name: "원시 공생체", rarity: "epic", weight: 4, role: "생산 ×1.5",
    grants: { scope: "globalRate", target: "*", type: "mult", value: D(1.5) } },

  // ── legendary ──
  { id: "apex", name: "정점 균주", rarity: "legendary", weight: 2, role: "생산 ×3",
    grants: { scope: "globalRate", target: "*", type: "mult", value: D(3) } },
  { id: "immortal", name: "불멸 계통", rarity: "legendary", weight: 1, role: "전 미터 지속 지지",
    grants: { scope: "meter", target: "*", type: "add", value: D(0.004) } },
];

/** 이 유닛이 해당 보스에 특히 유효한가 (UI 강조용) */
export function isRelevant(unit: UnitDef, bossId?: string): boolean {
  return !!bossId && !!unit.tags && unit.tags.includes(bossId);
}
