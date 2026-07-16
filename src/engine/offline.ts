// engine/offline.ts
// 오프라인 보상: rate × 경과시간 적분, 상한(cap) 적용, offlinePayout modifier(광고 ×N) 반영.
//   payout = min(elapsed, cap) × effectiveRate × offlineMultiplier

import Decimal from "break_infinity.js";
import { offlineMultiplier, resourceRate } from "./modifiers";
import { addBalance, addLifetime, type GameState } from "./state";

export interface OfflineReport {
  elapsedSec: number;
  cappedSec: number;
  perResource: Record<string, { rate: Decimal; payout: Decimal; mult: Decimal }>;
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
  return report;
}
