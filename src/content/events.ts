// content/events.ts
// 숙주 일상 이벤트(날씨) 데이터. §7(당뇨)·§8(자가면역) 숙주 일상 표를 데이터로 옮긴 것.
// 엔진 변경 없이 여기에 이벤트만 추가하면 새 날씨가 붙는다.

import Decimal from "break_infinity.js";
import type { HostEvent } from "../engine/events";

const D = (v: number) => new Decimal(v);

export const HOST_EVENTS: HostEvent[] = [
  // ── 보편 이벤트 ──
  {
    id: "stress",
    label: "회사 스트레스",
    kind: "bad",
    desc: "코르티솔 폭풍 → 빛(識)↓ · 염증↑",
    instant: { meters: { mind: -0.08 }, inflammation: 0.06 },
    temp: { durationSec: 20, mods: [{ scope: "meter", target: "mind", type: "add", value: D(-0.01) }] },
  },
  {
    id: "sleep",
    label: "숙면",
    kind: "good",
    desc: "성장호르몬·오토파지 → 재생 보너스",
    instant: { meters: { gut: 0.03, mind: 0.03 }, rootnodeDiversity: 0.03 },
  },
  {
    id: "walk",
    label: "산책·가벼운 운동",
    kind: "good",
    desc: "순환·열 보너스, 혈당 소모",
    instant: { meters: { water: 0.05, warmth: 0.05 }, gauge: -0.08 },
  },
  {
    id: "meditation",
    label: "명상·심호흡",
    kind: "good",
    desc: "부교감 활성 → 빛(識)↑ · 염증↓",
    instant: { meters: { mind: 0.06 }, inflammation: -0.03 },
  },

  // ── 당뇨(과잉형) ──
  {
    id: "latenight",
    label: "야식(라면·치킨)",
    kind: "bad",
    desc: "혈당 홍수 급증 + 보스 먹이 웨이브",
    bosses: ["diabetes_T2"],
    instant: { gauge: 0.18, inflammation: 0.04 },
    temp: { durationSec: 15, mods: [{ scope: "meter", target: "*", type: "add", value: D(-0.005) }] },
  },
  {
    id: "sitting",
    label: "오래 앉아있기",
    kind: "bad",
    desc: "미세순환 정체 → 물길↓ · 혈당 정체",
    bosses: ["diabetes_T2"],
    instant: { meters: { water: -0.06 }, gauge: 0.05 },
  },

  // ── 자가면역(공격형) ──
  {
    id: "gluten",
    label: "글루텐·자극 음식",
    kind: "bad",
    desc: "장누수 악화 → 자가항원 유입 웨이브",
    bosses: ["autoimmune_RA"],
    instant: { meters: { gut: -0.1 }, gauge: 0.1 },
  },
  {
    id: "angerburst",
    label: "분노 폭발(간기울결)",
    kind: "bad",
    desc: "교감 폭풍 → 면역 과활성 · 관절 발화(국소 실열)",
    bosses: ["autoimmune_RA"],
    instant: { meters: { mind: -0.1, warmth: 0.06 }, gauge: 0.08, inflammation: 0.05 },
  },
];

/** 현재 보스에 적용 가능한 이벤트만 (보편 + 해당 보스 전용) */
export function eventsForBoss(bossId?: string): HostEvent[] {
  return HOST_EVENTS.filter((e) => !e.bosses || (bossId !== undefined && e.bosses.includes(bossId)));
}
