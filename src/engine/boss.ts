// engine/boss.ts
// 보스 인카운터 라이프사이클: 시작 → 순·정·재 페이즈 게이팅 → 항상성 승리.
// 엔진은 content 를 import 하지 않는다. Boss(데이터)를 인자로 받아 Encounter(런타임)를 만든다.
//
// 페이즈 게이트는 데이터 문자열("warmth>=0.6 && water>=0.6")을 엔진이 직접 평가한다.
// 승리 = "죽이기"가 아니라 항상성 복원(미터 정상 밴드 + 염증 낮음 + 게이지 안정).

import Decimal from "break_infinity.js";
import {
  clampMeter,
  METER_KEYS,
  type Boss,
  type Encounter,
  type GameState,
} from "./state";
import {
  adjustedInflammationRegen,
  computeStartMeters,
  healRootnode,
} from "./rootnode";

// 순·정·재 손길의 한 번 클릭당 변화량 (튜닝)
export const HEAL_TUNING = {
  circulateWater: 0.06,
  circulateWarmth: 0.06,
  purifyInflammation: 0.1,
  purifyGauge: 0.1,
  purifyDetox: 0.08,
  regenGut: 0.06,
  regenMind: 0.04,
  regenRoot: 0.02,
};

const detoxBaseline: Record<Boss["detoxBurden"], number> = {
  low: 0.2,
  mid: 0.45,
  high: 0.7,
};
const detoxInflowBy: Record<Boss["detoxBurden"], number> = {
  low: 0.01,
  mid: 0.03,
  high: 0.05,
};

/** 보스전 시작: 상태(미터·염증·해독·게이지·디버프)를 이 보스로 세팅. */
export function startEncounter(s: GameState, boss: Boss): void {
  // 만류귀종: 뿌리노드 상태가 시작 조건을 좌우
  s.meters = computeStartMeters(boss, s);
  s.inflammation = boss.inflammation.value;
  s.detox = detoxBaseline[boss.detoxBurden];

  const enc: Encounter = {
    bossId: boss.id,
    disease: boss.disease,
    world: boss.world,
    emotion: boss.emotion,
    phase: "circulation",
    gauge: boss.gauge?.start ?? 0,
    gaugeLabel: boss.gauge?.id ?? "게이지",
    gaugeBehavior: boss.gauge?.behavior ?? "fill",
    gaugeFill: boss.gauge?.fill ?? 0,
    gaugeStableBand: boss.gauge?.stableBand ?? 0.5,
    inflammationRegen: adjustedInflammationRegen(boss, s),
    detoxInflow: detoxInflowBy[boss.detoxBurden],
    heatPolarity: boss.heatPolarity ?? 1,
    attackRaisesGauge: boss.attackRaisesGauge ?? 0,
    relapseResist: 0,
    paradox: boss.paradox,
    gates: {
      circulation: boss.phases.circulation.requires,
      purification: boss.phases.purification.requires,
      regeneration: boss.phases.regeneration.requires,
    },
    victory: { meters: boss.victory.meters, inflammationMax: boss.victory.inflammationMax },
    mindLock: boss.mindLock,
  };
  s.encounter = enc;

  // 기존 보스 디버프 제거 후 새 디버프 부여
  s.modifiers = s.modifiers.filter((m) => !m.source.startsWith("boss:"));
  (boss.debuffs ?? []).forEach((g, i) => {
    s.modifiers.push({ ...g, id: `boss:${boss.id}#${i}`, source: `boss:${boss.id}` });
  });
}

/** 보스전 종료(이탈): 디버프 제거, encounter 해제 */
export function endEncounter(s: GameState): void {
  s.modifiers = s.modifiers.filter((m) => !m.source.startsWith("boss:"));
  s.encounter = undefined;
}

// ── 게이트 평가 (데이터 문자열 → boolean) ──────────────────────
type Ctx = Record<string, number>;

function ctxOf(s: GameState): Ctx {
  return {
    gut: s.meters.gut,
    water: s.meters.water,
    warmth: s.meters.warmth,
    mind: s.meters.mind,
    inflammation: s.inflammation,
    detox: s.detox,
    gauge: s.encounter?.gauge ?? 0,
    diversity: s.rootnode.diversity,
  };
}

/** "ident op num && ident op num" 형태의 결합 조건을 평가 */
export function evalGate(expr: string, ctx: Ctx): boolean {
  if (!expr.trim()) return true;
  return expr.split("&&").every((term) => {
    const m = term.trim().match(/^([a-zA-Z_]+)\s*(>=|<=|==|>|<|≥|≤)\s*([\d.]+)$/);
    if (!m) return true; // 알 수 없는 항(설명문 등)은 통과 (P0)
    const [, id, op, numStr] = m;
    const lhs = ctx[id] ?? 0;
    const rhs = parseFloat(numStr);
    switch (op) {
      case ">=":
      case "≥":
        return lhs >= rhs;
      case "<=":
      case "≤":
        return lhs <= rhs;
      case ">":
        return lhs > rhs;
      case "<":
        return lhs < rhs;
      case "==":
        return lhs === rhs;
    }
    return true;
  });
}

/** 항상성 승리 판정 */
export function victoryMet(s: GameState): boolean {
  const e = s.encounter;
  if (!e) return false;
  const metersOk = METER_KEYS.every((k) => s.meters[k] >= e.victory.meters);
  const inflaOk = s.inflammation <= e.victory.inflammationMax;
  const gaugeOk = e.gauge <= e.gaugeStableBand;
  return metersOk && inflaOk && gaugeOk;
}

/** 매 틱 페이즈 진행/승리 평가 (tick 에서 호출) */
export function evaluatePhase(s: GameState): void {
  const e = s.encounter;
  if (!e || e.phase === "won") return;
  const ctx = ctxOf(s);
  if (e.phase === "circulation") {
    if (evalGate(e.gates.circulation, ctx)) e.phase = "purification";
  } else if (e.phase === "purification") {
    if (evalGate(e.gates.purification, ctx)) e.phase = "regeneration";
  } else if (e.phase === "regeneration") {
    if (victoryMet(s)) onVictory(s);
  }
}

function onVictory(s: GameState): void {
  const e = s.encounter!;
  e.phase = "won";
  // 클리어: 재발저항 = 현재 뿌리노드 다양성 (뿌리가 튼튼할수록 재발에 강함)
  e.relapseResist = s.rootnode.diversity;
  s.collection.add(`boss:${e.bossId}`);
  // 보스 디버프 해제
  s.modifiers = s.modifiers.filter((m) => !m.source.startsWith("boss:"));
}

// ── 순·정·재 손길 (플레이어 조작) ──────────────────────────────

/** 순환(막힌 것 열기): 물길↑, 온기 방향은 보스 극성(보/사) 따름 */
export function circulate(s: GameState): void {
  s.meters.water = clampMeter(s.meters.water + HEAL_TUNING.circulateWater);
  const pol = s.encounter?.heatPolarity ?? 1;
  s.meters.warmth = clampMeter(s.meters.warmth + HEAL_TUNING.circulateWarmth * pol);
}

/** 정화(쌓인 것 비우기): 염증↓, 질병 게이지 배수↓, 해독 부담↓ */
export function purify(s: GameState): void {
  s.inflammation = clampMeter(s.inflammation - HEAL_TUNING.purifyInflammation);
  s.detox = clampMeter(s.detox - HEAL_TUNING.purifyDetox);
  // 배수는 fill/drain 게이지(혈당·과활성·안개)에만. 종양(stealthGrow)은 직접 못 빼고
  // 연료 차단(염증↓)+감시(물길↑)로만 억제 → 은신형 손맛 유지.
  if (s.encounter && s.encounter.gaugeBehavior !== "stealthGrow") {
    s.encounter.gauge = Math.max(0, s.encounter.gauge - HEAL_TUNING.purifyGauge);
  }
}

/** 재생(생태계 복원): 숲↑, 빛↑, 뿌리노드 재건 */
export function regenerate(s: GameState): void {
  s.meters.gut = clampMeter(s.meters.gut + HEAL_TUNING.regenGut);
  s.meters.mind = clampMeter(s.meters.mind + HEAL_TUNING.regenMind);
  healRootnode(s, HEAL_TUNING.regenRoot);
}

/** 공격(딜): 역설 보스에선 게이지를 올려 자해가 된다 (공격=자해) */
export function forceAttack(s: GameState): void {
  const e = s.encounter;
  if (!e) return;
  if (e.attackRaisesGauge > 0) e.gauge += e.attackRaisesGauge;
}
