// engine/tick.ts
// 틱 루프: 생산 누적 · 임시 modifier 만료 · unlock 평가.
// Date.now() 기반 dt (탭 비활성/백그라운드에도 실시간 정확). 내부 고정 스텝으로 누적.

import Decimal from "break_infinity.js";
import { resourceRate } from "./modifiers";
import { stepEcosystem } from "./meters";
import { evaluatePhase } from "./boss";
import { addBalance, addLifetime, type GameState } from "./state";

const FIXED_STEP_MS = 100; // 내부 고정 스텝 (0.1s)

/**
 * now 까지 상태를 진행. 반환값 changed 는 인스펙터 갱신 필요 여부(dirty).
 * 큰 dt 는 offline 경로에서 별도 처리하므로 여기선 tick 간 짧은 dt 만 처리한다.
 */
export function tick(s: GameState, now: number): boolean {
  let elapsed = now - s.lastSeenAt;
  if (elapsed <= 0) {
    s.lastSeenAt = now;
    return false;
  }

  // 고정 스텝으로 잘라서 누적 (스텝 사이 modifier 변화/만료를 반영)
  let cursor = s.lastSeenAt;
  while (elapsed > 0) {
    const stepMs = Math.min(FIXED_STEP_MS, elapsed);
    const dt = new Decimal(stepMs).div(1000); // 초

    // 이 스텝 시작 시각 기준으로 만료 판정
    const stepNow = cursor + stepMs;

    for (const res of Object.values(s.resources)) {
      const rate = resourceRate(s, res.id, stepNow);
      if (rate.gt(0)) {
        const produced = rate.mul(dt);
        addBalance(s, res.id, produced);
        addLifetime(s, res.id, produced);
      }
    }

    // 생태계 시뮬레이션 (미터·염증·해독·게이지)
    const dtNum = stepMs / 1000;
    stepEcosystem(s, dtNum, stepNow);
    // 보스 페이즈 진행/승리 평가
    evaluatePhase(s);

    // 만료된 임시 modifier 제거
    pruneExpired(s, stepNow);
    // 해금 조건 평가
    evaluateUnlocks(s);

    cursor += stepMs;
    elapsed -= stepMs;
  }

  s.lastSeenAt = now;
  return true;
}

export function pruneExpired(s: GameState, now: number): void {
  s.modifiers = s.modifiers.filter(
    (m) => m.expiresAt === undefined || m.expiresAt > now
  );
}

export function evaluateUnlocks(s: GameState): void {
  for (const g of Object.values(s.generators)) {
    if (g.unlocked || !g.unlockAt) continue;
    const bal = s.resources[g.unlockAt.resource]?.amount ?? new Decimal(0);
    if (bal.gte(g.unlockAt.amount)) g.unlocked = true;
  }
}
