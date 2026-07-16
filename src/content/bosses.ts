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

// ── 보스 #3 · 우울 (금·폐대장·장-뇌축 / 강요형) ────────────────
// "그냥 긍정적으로 생각해"가 통하지 않음을 규칙으로 — 몸(지반)을 고쳐야 마음(識)이 열린다.
// 존엄·희망 프레이밍(§0): 자해/위기 묘사 없음. 회복의 방향으로만.
export const DEPRESSION: Boss = {
  id: "depression",
  disease: "우울",
  world: "metal", // 대표 월드(슬픔·폐대장). 실제 뿌리는 장-뇌축으로 다층.
  organ: "폐대장(장-뇌축)",
  emotion: "슬픔·무기력",
  tasteResource: "pungent", // 매운맛(발산·순환)
  startMeters: { gut: 0.3, water: 0.4, warmth: 0.35, mind: 0.2 },
  detoxBurden: "mid",
  inflammation: { value: 0.65, regen: 0.045 }, // 신경염증
  gauge: {
    id: "안개(회색)",
    behavior: "fill", // 안개가 차오른다(=색채가 빠진다). overflow 시 채도·생산↓
    drivers: ["고립", "밤샘", "자책"],
    overflow: "-allMeters · 채도↓",
    fill: 0.02,
    stableBand: 0.5,
  },
  heatPolarity: 1, // 뇌 에너지 재점화(열↑) — 무기력의 물질적 기반부터
  sensitive: true, // 민감 주제 — 프레이밍 강조
  paradox: "'그냥 긍정'은 불가능 — 몸(지반)을 먼저 고쳐야 마음(識)이 열린다",
  // ★ 식(識) 잠금: 지반(장·수·열 평균 ≥0.6, 염증 ≤0.4) 전엔 빛(mind) cap 0.35
  mindLock: { foundationMeters: 0.6, foundationInflammation: 0.4, cap: 0.35 },
  // 치유 지혜(영구): 마음의 회복력 → 빛(mind) 지속 지지
  clearReward: { scope: "meter", target: "mind", type: "add", value: D(0.004) },
  phases: {
    circulation: { requires: "water>=0.55 && warmth>=0.55" }, // 뇌 산소·에너지 재점화
    purification: { requires: "inflammation<=0.4" }, // 신경염증 차단
    regeneration: { requires: "gut>=0.7 && mind>=0.6" }, // 원료공장 재건 → 식 잠금 해제 후 파장 전환
  },
  victory: { band: "색채복귀", meters: 0.7, inflammationMax: 0.3 },
};

// ── 보스 #4 · 암 계열 (은신형·심연) ───────────────────────────
// "죽이기"가 아니라 환경을 교정해 굶기고 감시망을 유지(관해). 순수 판타지 은유.
// §0/§8 민감: 완치 단정 금지, 존엄·희망 방향으로만.
//
// archetype 상속: CANCER_BASE 를 makeCancer()로 확장 → 장부/월드만 바꿔 재생산.
const CANCER_BASE: Omit<Boss, "id" | "disease" | "world" | "organ" | "tasteResource"> = {
  emotion: "생명력 이상",
  startMeters: { gut: 0.4, water: 0.35, warmth: 0.45, mind: 0.4 },
  detoxBurden: "high",
  inflammation: { value: 0.6, regen: 0.05 },
  gauge: {
    id: "종양",
    behavior: "stealthGrow", // 은신 증식 — 연료(염증)로 자라고 감시(물길)로 억제
    drivers: ["unwatched", "염증연료"],
    overflow: "전이 위협",
    fill: 0.03,
    stableBand: 0.35,
    start: 0.6, // 이미 존재하는 종양 — 관해까지 능동적으로 억제해야
  },
  heatPolarity: 1,
  archetype: "cancer_base",
  sensitive: true, // 민감 주제 — 프레이밍 강조
  paradox: "'죽이기' 아님 — 환경 교정으로 굶기고 감시망을 유지(관해)",
  // 치유 지혜(영구): 정기(면역감시) 강화 → 전 월드 생산 ×1.25
  clearReward: { scope: "globalRate", target: "*", type: "mult", value: D(1.25) },
  phases: {
    circulation: { requires: "water>=0.6" }, // 은신 해제(NK 순찰 가동)
    purification: { requires: "inflammation<=0.35" }, // 연료 차단 + 독소 배출
    regeneration: { requires: "gut>=0.7 && water>=0.7" }, // 감시망 + 장면역 + 정기
  },
  victory: { band: "관해", meters: 0.7, inflammationMax: 0.3, extra: "감시유지(완치 단정 아님)" },
};

function makeCancer(
  over: Pick<Boss, "id" | "disease" | "world" | "organ" | "tasteResource"> & Partial<Boss>
): Boss {
  return { ...CANCER_BASE, ...over };
}

// 대장암 계열 — 장(월드1) 근본 직결 (토·비위대장)
export const COLON_CANCER = makeCancer({
  id: "colon_cancer",
  disease: "대장암 계열",
  world: "earth",
  organ: "비위·대장",
  tasteResource: "sweet",
});

export const BOSSES: Boss[] = [DIABETES_T2, AUTOIMMUNE_RA, DEPRESSION, COLON_CANCER];

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
