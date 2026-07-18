// main.ts
// 엔진 + 콘텐츠 + 인스펙터를 연결하는 조립부.
//   - 상태 로드/생성 → 오프라인 정산 → 틱 루프 → 인스펙터 렌더

import { tick } from "./engine/tick";
import { claimOffline } from "./engine/offline";
import { doPrestige } from "./engine/prestige";
import {
  activateBooster,
  buyUpgrade,
  drawMutation,
  drawUnit,
  evolve,
} from "./engine/actions";
import {
  circulate,
  crisisSupport,
  endEncounter,
  forceAttack,
  purify,
  regenerate,
  startEncounter,
} from "./engine/boss";
import { applyEvent } from "./engine/events";
import { spendTaste } from "./engine/taste";
import { tasteEffect } from "./content/worlds";
import { getAdService, initAds } from "./platform/ads";
import { BOSSES } from "./content/bosses";
import { HOSTS } from "./content/campaign";
import { HOST_EVENTS } from "./content/events";
import { UNITS } from "./content/units";
import {
  loadFromStorage,
  saveToStorage,
  clearStorage,
} from "./engine/save";
import type { GameState } from "./engine/state";
import * as C from "./content/config";
import { createInspector, type InspectorCtx } from "./debug/inspector";
import { createGameUI } from "./game/gameUI";
import { createDefenseGame } from "./defense/game";

// ── 업그레이드 레벨을 state.modifiers 로부터 재동기화 ──────────────
// upgrade level 은 별도 저장하지 않고 "해당 source 의 modifier 개수" 로 파생.
// (환생/로드 후 level·다음비용을 무손실 복원 — 수용기준 6)
function syncLevels(s: GameState) {
  for (const up of C.UPGRADES) {
    up.level = s.modifiers.filter((m) => m.source === `upgrade:${up.id}`).length;
  }
  for (const up of C.PRESTIGE.permanentUpgrades) {
    up.level = s.modifiers.filter((m) => m.source === `prestige:${up.id}`).length;
  }
}

// ── 상태 초기화 ────────────────────────────────────────────────
let state: GameState =
  loadFromStorage(C.reattachCondition) ?? C.createInitialState(Date.now());
syncLevels(state);

// 로드된 저장이면 오프라인 정산
{
  const now = Date.now();
  const elapsed = (now - state.lastSeenAt) / 1000;
  if (elapsed > 1) {
    const report = claimOffline(state, elapsed, C.OFFLINE_CAP_SEC, now);
    const ep = report.perResource[C.RESOURCE_IDS.EP];
    if (ep && ep.payout.gt(0)) {
      console.log(
        `[offline] ${elapsed.toFixed(0)}s → capped ${report.cappedSec.toFixed(0)}s ` +
          `× rate ${ep.rate.toString()} × mult ${ep.mult.toString()} = +${ep.payout.toString()} EP`
      );
    }
  }
  state.lastSeenAt = now;
}

// 캠페인: 진행 중인 인카운터가 없으면 현재 숙주의 보스를 시작
function ensureHostEncounter() {
  if (state.encounter) return;
  const host = HOSTS[state.campaign.hostIndex];
  if (host) startEncounter(state, host.boss);
}
ensureHostEncounter();

// ── 뷰: 게임 UI + 디버그 인스펙터 (토글) ────────────────────────
const app = document.getElementById("app")!;
app.innerHTML = `<button id="viewToggle" style="position:fixed;top:8px;right:8px;z-index:30;background:#1b222b;color:#cbd5e1;border:1px solid #2b3540;border-radius:8px;padding:6px 10px;font:inherit;font-size:12px;cursor:pointer">⚙ 디버그</button><button id="defenseToggle" style="position:fixed;top:8px;right:96px;z-index:30;background:linear-gradient(160deg,#8fe9b6,#6fe0a6);color:#16311f;border:none;border-radius:8px;padding:6px 12px;font:inherit;font-weight:700;font-size:12px;cursor:pointer">🛡 지켜라</button><div id="game"></div><div id="debug" hidden></div><div id="defense" hidden></div>`;

const ctx: InspectorCtx = {
  getState: () => state,
  now: () => Date.now(),
  actions: {
    evolve() {
      evolve(
        state,
        state.generators[C.MAIN_GENERATOR_ID],
        C.TIER.cost,
        C.TIER.mult,
        C.RESOURCE_IDS.EP,
        Date.now()
      );
    },
    buyUpgrade(id) {
      const up = C.UPGRADES.find((u) => u.id === id);
      if (up) buyUpgrade(state, up, `upgrade:${up.id}`, Date.now());
    },
    buyPermanent(id) {
      const up = C.PRESTIGE.permanentUpgrades.find((u) => u.id === id);
      if (up) buyUpgrade(state, up, `prestige:${up.id}`, Date.now());
    },
    draw() {
      drawMutation(state, C.MUTATIONS, Math.random());
    },
    drawHero() {
      // gacha 광고 지점: 웹=스텁(즉시), 네이티브=AdMob 리워드
      getAdService()
        .showRewarded("gacha")
        .then((r) => {
          if (r.rewarded) drawUnit(state, UNITS, Math.random());
        });
    },
    prestige() {
      doPrestige(state, C.PRESTIGE, C.initialSnapshot());
      syncLevels(state);
    },
    booster(id) {
      const b = C.BOOSTERS.find((x) => x.id === id);
      if (!b) return;
      // 리워드 광고 게이트: 웹=스텁(즉시), 네이티브=AdMob 리워드 광고 후 보상
      getAdService()
        .showRewarded("booster")
        .then((r) => {
          if (r.rewarded) activateBooster(state, b, Date.now());
        });
    },
    offlineAd() {
      getAdService()
        .showRewarded("offlineBoost")
        .then((r) => {
          if (!r.rewarded) return;
          // offlinePayout scope 임시 modifier 를 얹는다 → 다음 스킵 보상 ×N
          activateBooster(
            state,
            { id: C.OFFLINE_AD.id, grants: C.OFFLINE_AD.grants, durationSec: C.OFFLINE_AD.durationSec },
            Date.now()
          );
        });
    },
    skip(hours) {
      const now = Date.now();
      const report = claimOffline(state, hours * 3600, C.OFFLINE_CAP_SEC, now);
      const ep = report.perResource[C.RESOURCE_IDS.EP];
      console.log(
        `[skip ${hours}h] capped ${report.cappedSec.toFixed(0)}s → +${ep.payout.toString()} EP (mult ${ep.mult.toString()})`
      );
    },
    save() {
      state.lastSeenAt = Date.now();
      saveToStorage(state);
      console.log("[save] ok");
    },
    load() {
      const loaded = loadFromStorage(C.reattachCondition);
      if (loaded) {
        state = loaded;
        syncLevels(state);
        const now = Date.now();
        const elapsed = (now - state.lastSeenAt) / 1000;
        if (elapsed > 1) claimOffline(state, elapsed, C.OFFLINE_CAP_SEC, now);
        state.lastSeenAt = now;
        console.log("[load] ok");
      }
    },
    hardReset() {
      clearStorage();
      state = C.createInitialState(Date.now());
      syncLevels(state);
      console.log("[reset] ok");
    },
    // ── 《속나라》 보스전 & 순·정·재 손길 ──
    startBoss(id) {
      const boss = BOSSES.find((b) => b.id === id);
      if (boss) startEncounter(state, boss);
    },
    leaveBoss() {
      endEncounter(state);
    },
    // 이주: 현재 숙주를 클리어(항상성 복원)했을 때만 다음 사람에게로.
    //   지혜(genes·도감)는 계승, 몸(EP·생산·뿌리노드)은 새것으로 리셋.
    migrate() {
      if (state.encounter?.phase !== "won") return;
      const next = state.campaign.hostIndex + 1;
      if (next >= HOSTS.length) return; // 마지막 숙주 — 더 이상 이주할 곳 없음
      doPrestige(state, C.PRESTIGE, C.initialSnapshot()); // genes 획득 + 몸 리셋
      syncLevels(state);
      state.rootnode = C.initialRootnode(); // 새 몸 = 새 마이크로바이옴
      state.campaign.hostIndex = next;
      startEncounter(state, HOSTS[next].boss);
      console.log(`[migrate] → ${HOSTS[next].name} (${HOSTS[next].boss.disease})`);
    },
    circulate() {
      circulate(state);
    },
    purify() {
      purify(state);
    },
    regenerate() {
      regenerate(state);
    },
    attack() {
      forceAttack(state);
    },
    crisis() {
      // 위기 지원군 광고 지점: 게이지 크게↓ + 염증 진정
      getAdService()
        .showRewarded("crisis")
        .then((r) => {
          if (r.rewarded) crisisSupport(state);
        });
    },
    meditation() {
      // 파장/명상 부스터 광고 지점: 빛(mind) 지속 지지 임시 modifier
      getAdService()
        .showRewarded("meditation")
        .then((r) => {
          if (r.rewarded) activateBooster(state, C.MEDITATION_BOOSTER, Date.now());
        });
    },
    hostEvent(id) {
      const ev = HOST_EVENTS.find((e) => e.id === id);
      if (ev) applyEvent(state, ev, Date.now());
    },
    useTaste() {
      const taste = state.encounter?.taste;
      if (taste) spendTaste(state, taste, tasteEffect(taste));
    },
  },
};

const gameUI = createGameUI(document.getElementById("game")!, ctx);
const inspector = createInspector(document.getElementById("debug")!, ctx);

let view: "game" | "debug" = "game";
const active = () => (view === "game" ? gameUI : inspector);
const toggleBtn = document.getElementById("viewToggle")!;
toggleBtn.addEventListener("click", () => {
  view = view === "game" ? "debug" : "game";
  document.getElementById("game")!.hidden = view !== "game";
  document.getElementById("debug")!.hidden = view !== "debug";
  toggleBtn.textContent = view === "game" ? "⚙ 디버그" : "🎮 게임";
  active().render();
});

// ── 디펜스 모드 《내몸을 지켜라》 토글 ──
const defenseGame = createDefenseGame(document.getElementById("defense")!);
const defenseEl = document.getElementById("defense")!;
const defenseBtn = document.getElementById("defenseToggle")!;
let inDefense = false;
defenseBtn.addEventListener("click", () => {
  inDefense = !inDefense;
  defenseEl.hidden = !inDefense;
  document.getElementById("game")!.hidden = inDefense || view !== "game";
  document.getElementById("debug")!.hidden = inDefense || view !== "debug";
  toggleBtn.style.display = inDefense ? "none" : "";
  defenseBtn.textContent = inDefense ? "← 나가기" : "🛡 지켜라";
  if (inDefense) defenseGame.show();
  else defenseGame.hide();
});

// 승리 감지 → 영구 '치유 지혜' 배지 materialize (Decimal은 modifiers 직렬화가 처리)
function grantClearReward() {
  const e = state.encounter;
  if (!e || e.phase !== "won") return;
  const src = `heal:${e.bossId}`;
  if (state.modifiers.some((m) => m.source === src)) return; // 이미 부여됨
  const boss = BOSSES.find((b) => b.id === e.bossId);
  if (boss?.clearReward) {
    state.modifiers.push({ ...boss.clearReward, id: src, source: src });
    console.log(`[heal] ${e.bossId} 치유 지혜 배지 획득`);
  }
}

// 리워드 광고 초기화 (네이티브에서 AdMob init, 웹은 no-op)
initAds();

// ── 루프 ───────────────────────────────────────────────────────
setInterval(() => {
  tick(state, Date.now());
  grantClearReward();
}, 100); // 생산 틱 + 승리 보상
setInterval(() => active().render(), 200); // 활성 뷰 갱신
setInterval(() => inspector.tickGraph(), 1000); // 그래프 샘플(디버그)
setInterval(() => {
  state.lastSeenAt = Date.now();
  saveToStorage(state);
}, 15000); // 자동 저장

window.addEventListener("beforeunload", () => {
  state.lastSeenAt = Date.now();
  saveToStorage(state);
});

active().render();
