// engine/prestige.ts
// 프레스티지(환생): 진행 상태 리셋 + 진행도를 영구 Modifier(로 사는 통화)로 변환.
//
// resetScope 토큰 규칙 (데이터 주도):
//   "resources"           → 모든 resource amount 를 initial 로
//   "generators"          → 모든 generator 를 initial 상태로 (count/tier/unlocked)
//   그 외 문자열 T        → source 가 T 로 시작하는 modifier 를 제거 (예: "upgrade:", "tier:", "booster:")
//
// resetScope 에 없는 source 의 modifier 는 살아남는다.
//   → "mutation:*"(도감 영구), "prestige:*"(영구 트리), "setBonus:*" 는 리셋해도 유지.

import Decimal from "break_infinity.js";
import { addBalance, type GameState, type Generator, type PrestigeLayer } from "./state";

/** initial 스냅샷 (환생 시 특정 부분만 되돌리기 위해 필요) */
export interface InitialSnapshot {
  resourceAmount: Record<string, Decimal>;
  generator: Record<string, Pick<Generator, "count" | "tier" | "unlocked">>;
}

export function canPrestige(s: GameState, layer: PrestigeLayer): boolean {
  return layer.gainFormula(s).gt(0);
}

export function doPrestige(
  s: GameState,
  layer: PrestigeLayer,
  snapshot: InitialSnapshot
): Decimal {
  const gain = layer.gainFormula(s);

  // 1) 진행도를 통화로 변환
  addBalance(s, layer.currency, gain);
  s.prestige.count += 1;

  // 2) resetScope 적용
  for (const token of layer.resetScope) {
    if (token === "resources") {
      for (const res of Object.values(s.resources)) {
        res.amount = snapshot.resourceAmount[res.id] ?? new Decimal(0);
      }
    } else if (token === "generators") {
      for (const g of Object.values(s.generators)) {
        const init = snapshot.generator[g.id];
        if (init) {
          g.count = init.count;
          g.tier = init.tier;
          g.unlocked = init.unlocked;
        }
      }
    } else {
      // source prefix 로 modifier 제거
      s.modifiers = s.modifiers.filter((m) => !m.source.startsWith(token));
    }
  }

  return gain;
}
