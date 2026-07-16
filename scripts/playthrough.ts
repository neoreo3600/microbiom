// scripts/playthrough.ts
// 밸런스 회귀 가드 — 모든 보스가 '올바른 순·정·재 순서'로 완주 가능한지 시뮬레이션한다.
// 실행:  npm run playthrough   (실패 보스 있으면 non-zero exit)
//
// 페이즈 인식 '올바른 플레이':
//   - 순환기: 순환(淸熱/수·열) + 정화(염증 관리)
//   - 이후: 정화(염증 끊기) + 재생(지반·뿌리)
//   - 온기가 부족하고 보(heatPolarity>0)일 때만 온기 보충 (자가면역은 淸熱 후 자연 회복)
// naive "다 눌러" 플레이는 자가면역을 못 깬다(온기 과냉각) — 허실 분기가 실제로 작동한다는 뜻.

import { createInitialState } from "../src/content/config";
import { BOSSES } from "../src/content/bosses";
import { startEncounter, circulate, purify, regenerate, evaluatePhase } from "../src/engine/boss";
import { stepEcosystem } from "../src/engine/meters";
import type { Boss } from "../src/engine/state";

const T0 = 1_000_000;
const MAX_ITER = 800; // 800 iter = 400s sim (한 iter = 0.5s)

function play(boss: Boss) {
  const s = createInitialState(T0);
  s.rootnode.diversity = 0.3; // 첫 숙주(취약한 뿌리) 기준
  startEncounter(s, boss);
  let now = T0;
  const phaseAt: Record<string, number> = {};
  for (let iter = 1; iter <= MAX_ITER; iter++) {
    const e = s.encounter!;
    if (e.phase === "circulation") {
      circulate(s);
      purify(s);
    } else {
      purify(s);
      regenerate(s);
      if (e.heatPolarity > 0 && s.meters.warmth < 0.72) circulate(s);
    }
    for (let k = 0; k < 5; k++) {
      now += 100;
      stepEcosystem(s, 0.1, now);
      evaluatePhase(s);
    }
    const ph = s.encounter!.phase;
    if (!(ph in phaseAt)) phaseAt[ph] = iter;
    if (ph === "won") return { won: true, sec: +(iter * 0.5).toFixed(1), iters: iter, phaseAt };
  }
  return { won: false, sec: Infinity, iters: MAX_ITER, phaseAt, state: s };
}

let failures = 0;
console.log("=== 《속나라》 보스 완주 플레이스루 (올바른 순·정·재) ===");
for (const b of BOSSES) {
  const r: any = play(b);
  if (r.won) {
    console.log(`✅ ${b.id.padEnd(14)} 완주 ${r.sec}s (${r.iters}iter) | 페이즈도달 ${JSON.stringify(r.phaseAt)}`);
  } else {
    failures++;
    const s = r.state;
    const m = Object.fromEntries(Object.entries(s.meters).map(([k, v]: any) => [k, +v.toFixed(2)]));
    console.log(`❌ ${b.id.padEnd(14)} 미완주 phase=${s.encounter.phase} meters=${JSON.stringify(m)} infl=${s.inflammation.toFixed(2)} gauge=${s.encounter.gauge.toFixed(2)}`);
  }
}
console.log(failures === 0 ? "\n🟢 모든 보스 완주 가능" : `\n🔴 ${failures}개 보스 미완주`);
process.exit(failures === 0 ? 0 : 1);
