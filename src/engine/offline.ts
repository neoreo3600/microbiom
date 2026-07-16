// engine/offline.ts
// 오프라인 보상: rate × 경과시간 적분, 상한(cap) 적용, offlinePayout modifier(광고 ×N) 반영.
//   payout = min(elapsed, cap) × effectiveRate × offlineMultiplier

import Decimal from "break_infinity.js";
import { offlineMultiplier, resourceRate } from "./modifiers";
import { TASTE_ACCRUE_RATE } from "./taste";
import { addBalance, addLifetime, type GameState } from "./state";

export interface OfflineReport {
  elapsedSec: number;
  cappedSec: number;
  perResource: Record<string, { rate: Decimal; payout: Decimal; mult: Decimal }>;
  tasteAccrued?: { id: string; amount: number }; // 오미 정산 (인카운터 중일 때)
}

/**
 * elapsedSec 만큼의 오프라인 보상을 정산해 상태에 반영하고 리포트를 반환.
 * capSec 상한을 적용하며, 현재 상태의 offlinePayout modifier 를 배수로 반영한다.
 * (rate 는 정산 시점 상태 기준으로 고정 — 적분 근사)
 */
export function claimOffline(
  s: GameState,
  elapsedSec: number,
  capSec: number,
  now: number
): OfflineReport {
  const cappedSec = Math.max(0, Math.min(elapsedSec, capSec));
  const report: OfflineReport = { elapsedSec, cappedSec, perResource: {} };

  for (const res of Object.values(s.resources)) {
    const rate = resourceRate(s, res.id, now);
    const mult = offlineMultiplier(s, res.id, now);
    const payout = rate.mul(cappedSec).mul(mult);
    if (payout.gt(0)) {
      addBalance(s, res.id, payout);
      addLifetime(s, res.id, payout);
    }
    report.perResource[res.id] = { rate, payout, mult };
  }

  // 오미(五味) 정산 — 진행 중 인카운터의 오미를 경과시간만큼 축적 (cap·광고 배수 반영).
  // 미터/게이지는 오프라인에 진행시키지 않는다 (보스는 능동 플레이 유지 — 자는 동안 승리 방지).
  const taste = s.encounter?.taste;
  if (taste) {
    const mult = offlineMultiplier(s, taste, now).toNumber();
    const amount = cappedSec * TASTE_ACCRUE_RATE * mult;
    if (amount > 0) {
      s.tasteResources[taste] = (s.tasteResources[taste] ?? 0) + amount;
      report.tasteAccrued = { id: taste, amount };
    }
  }
  return report;
}
