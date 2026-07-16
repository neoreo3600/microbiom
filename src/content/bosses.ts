// content/bosses.ts
// 보스(질병) 데이터. 엔진 코드 변경 없이 여기에 config 만 추가하면 새 보스가 붙는다.
// §V(당뇨·과잉형) / §VI(자가면역·공격형) 인코딩 스케치를 그대로 데이터로 옮긴 것.
//
// 게이트식 식별자: gut / water / warmth / mind / inflammation / detox / gauge / diversity
// (엔진 boss.evalGate 가 이 식별자로 평가한다)

import Decimal from "break_infinity.js";
import type { Boss } from "../engine/state";

const D = (v: number) => new Decimal(v);

// ── 보스 #1 · 2형 당뇨 (토·비위 / 과잉형) ─────────────────────
// "더 만들면 이긴다"가 틀림 — 차오르는 혈당을 굶기고 근본(감수성·코르티솔) 교정.
export const DIABETES_T2: Boss = {
  id: "diabetes_T2",
  disease: "2형 당뇨",
  world: "earth",
  organ: "비위",
  emotion: "사려", // 빛(mind) 전환 대상
  tasteResource: "sweet", // 단맛 (정제당 = boss feed)
  startMeters: { gut: 0.4, water: 0.35, warmth: 0.4, mind: 0.3 },
  detoxBurden: "high",
  inflammation: { value: 0.7, regen: 0.05 }, // 크로스-빌런
  gauge: {
    id: "혈당",
    behavior: "fill", // 계속 차오름
    drivers: ["정제당event"],
    overflow: "-allMeters",
    fill: 0.03, // 초당 상승 → 정화(배수)로 관리
    stableBand: 0.5,
  },
  heatPolarity: 1, // 열↑ 가 답(보) — 대사 점화
  paradox: undefined,
  // 인슐린 저항: 생산→세포 전환 효율 ×0.5 (재생 페이즈에서 감수성 복구로 해제)
  debuffs: [{ scope: "globalRate", target: "*", type: "mult", value: D(0.5) }],
  // 치유 지혜(영구): 대사 균형을 되살린 경험 → 전 월드 생산 ×1.2 (이주해도 유지)
  clearReward: { scope: "globalRate", target: "*", type: "mult", value: D(1.2) },
  phases: {
    // 순환: 온기·물길을 열어야 다음 단계 자원이 돈다
    circulation: { requires: "warmth>=0.6 && water>=0.6" },
    // 정화: 염증을 눌러야 boss regen 정지
    purification: { requires: "inflammation<=0.4" },
    // 재생: 숲(감수성)·빛(코르티솔) 복구
    regeneration: { requires: "gut>=0.7 && mind>=0.6" },
  },
  victory: { band: "혈당안정", meters: 0.7, inflammationMax: 0.3 },
};

// ── 보스 #2 · 류마티스 관절염 (목·간담 / 공격형) ───────────────
// "때리면 이긴다"가 틀림 — 공격=자해. 국소 淸熱 + 장벽복구 + Treg 관용.
export const AUTOIMMUNE_RA: Boss = {
  id: "autoimmune_RA",
  disease: "류마티스 관절염(자가면역)",
  world: "wood",
  organ: "간담",
  emotion: "분노", // 빛(mind) 전환 대상
  tasteResource: "sour", // 신맛 (간 해독 2상 지원)
  startMeters: { gut: 0.35, water: 0.45, warmth: 0.55, mind: 0.3 },
  detoxBurden: "high",
  inflammation: { value: 0.85, regen: 0.06 },
  gauge: {
    id: "면역과활성",
    behavior: "fill",
    drivers: ["player_attack", "장누수_leak", "stress"],
    overflow: "-allMeters + 관절발화",
    fill: 0.02,
    stableBand: 0.45,
  },
  heatPolarity: -1, // ★ 국소 실열 — 순환 시 온기를 내린다(淸熱). 당뇨와 정반대.
  attackRaisesGauge: 0.08, // ★ 공격=자해: 딜을 넣으면 과활성 게이지 상승
  paradox: "공격=자해 (아군 오사): 딜을 버리는 게 이득",
  // 장누수 → 자가항원 유입: 숲(gut) 미터에 지속 음압력
  debuffs: [{ scope: "meter", target: "gut", type: "add", value: D(-0.01) }],
  // 치유 지혜(영구): 장벽·면역 관용을 되살린 경험 → 숲(gut) 지속 지지 +0.004/s (이주해도 유지)
  clearReward: { scope: "meter", target: "gut", type: "add", value: D(0.004) },
  phases: {
    // 순환: 淸熱(국소열↓) + 물길 순환↑. 열을 무작정 올리면 실패.
    circulation: { requires: "water>=0.6 && warmth<=0.45" },
    // 정화: 장벽 복구(숲) + 염증 차단
    purification: { requires: "gut>=0.55 && inflammation<=0.4" },
    // 재생: Treg 관용 회복 + 빛(분노→평온) 전환
    regeneration: { requires: "gut>=0.7 && mind>=0.6" },
  },
  victory: { band: "면역관용", meters: 0.7, inflammationMax: 0.3 },
};

export const BOSSES: Boss[] = [DIABETES_T2, AUTOIMMUNE_RA];

/** 만류귀종 연쇄 트리 (§7) — 표시·학습용 데이터 */
export const CHAIN_TREE: { root: string; branches: { gate: string; diseases: string[] }[] } = {
  root: "microbiome",
  branches: [
    { gate: "장벽누수", diseases: ["자가면역", "아토피", "장-피부"] },
    { gate: "염증", diseases: ["대사증후군", "신경염증", "관절염"] },
    { gate: "대사", diseases: ["당뇨", "지방간", "PCOS"] },
    { gate: "HPA", diseases: ["불안", "불면", "번아웃", "IBS"] },
  ],
};

/** 되먹임 고리 (§7) — 표시용. 실제 압력은 engine/meters.ts feedback 에서 계산 */
export const FEEDBACK_LOOPS = ["장-뇌축 (장↓→세로토닌↓→불안→코르티솔↑→장↓)", "염증-인슐린"];
