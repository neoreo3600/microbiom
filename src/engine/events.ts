// engine/events.ts
// 숙주 일상 = 게임의 날씨 (혼돈 엔진).
// 숙주의 하루(야식·스트레스·수면·산책…)가 속나라에 즉시 효과 + 임시 modifier(날씨)로 작용한다.
// "오늘 숙주가 야식 먹었네" 하고 방어를 짜는 게 핵심 훅.
//
// 엔진은 이벤트 "타입"과 "적용"만 안다. 구체 데이터는 content/events.ts.

import { clampMeter, type GameState, type MeterKey, type Modifier } from "./state";

export interface HostEvent {
  id: string;
  label: string;
  kind: "bad" | "good";
  desc: string;
  bosses?: string[]; // 적용 보스 (없으면 보편 이벤트)
  instant?: {
    meters?: Partial<Record<MeterKey, number>>; // 미터 즉시 가감
    inflammation?: number;
    detox?: number;
    gauge?: number; // 질병 게이지 즉시 가감 (야식→혈당↑ 등)
    rootnodeDiversity?: number;
  };
  temp?: {
    // 임시 modifier(날씨) — expiresAt 붙여 스택
    durationSec: number;
    mods: Omit<Modifier, "id" | "source" | "expiresAt">[];
  };
}

/** 이벤트를 상태에 적용 (즉시 효과 + 임시 modifier). */
export function applyEvent(s: GameState, ev: HostEvent, now: number): void {
  const ins = ev.instant;
  if (ins) {
    if (ins.meters) {
      for (const k of Object.keys(ins.meters) as MeterKey[]) {
        s.meters[k] = clampMeter(s.meters[k] + (ins.meters[k] ?? 0));
      }
    }
    if (ins.inflammation !== undefined) s.inflammation = clampMeter(s.inflammation + ins.inflammation);
    if (ins.detox !== undefined) s.detox = clampMeter(s.detox + ins.detox);
    if (ins.gauge !== undefined && s.encounter) {
      s.encounter.gauge = Math.max(0, s.encounter.gauge + ins.gauge);
    }
    if (ins.rootnodeDiversity !== undefined) {
      s.rootnode.diversity = clampMeter(s.rootnode.diversity + ins.rootnodeDiversity);
    }
  }
  if (ev.temp) {
    const expiresAt = now + ev.temp.durationSec * 1000;
    ev.temp.mods.forEach((m, i) => {
      s.modifiers.push({ ...m, id: `event:${ev.id}#${i}@${now}`, source: `event:${ev.id}`, expiresAt });
    });
  }
}
