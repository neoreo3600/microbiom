// game/gameUI.ts
// 플레이어용 게임 화면 (모바일 세로 HUD). 디버그 인스펙터와 같은 엔진/액션을 소비한다.
// 슬라이스 1: 보스전 핵심 루프 — 숙주 헤더 · 페이즈 스테퍼 · 미터/게이지 · 순·정·재 손길 · 승리 오버레이.

import Decimal from "break_infinity.js";
import {
  clampMeter,
  type GameState,
  type MeterKey,
} from "../engine/state";
import { mindFoundationMet, feedbackLoops } from "../engine/meters";
import { resourceRate, generatorRate, applyCostModifiers } from "../engine/modifiers";
import { nextCost, unitCount } from "../engine/actions";
import { computeCost } from "../engine/cost";
import * as C from "../content/config";
import { HOSTS } from "../content/campaign";
import { BOSSES } from "../content/bosses";
import { WORLDS, worldById, ELEMENT_LABEL, tasteLabel, TASTE_EFFECT_DESC } from "../content/worlds";
import { UNITS, isRelevant } from "../content/units";
import { unitAvatar } from "./art";
import { tasteAmount, TASTE_COST } from "../engine/taste";
import type { InspectorActions, InspectorCtx } from "../debug/inspector";
import { fmt } from "../debug/format";

const METER_META: Record<MeterKey, { label: string; color: string }> = {
  gut: { label: "숲", color: "#4ade80" },
  water: { label: "물길", color: "#38bdf8" },
  warmth: { label: "온기", color: "#fb923c" },
  mind: { label: "빛", color: "#c084fc" },
};

const PHASES: { key: string; label: string }[] = [
  { key: "circulation", label: "순환" },
  { key: "purification", label: "정화" },
  { key: "regeneration", label: "재생" },
  { key: "won", label: "회복" },
];

export function createGameUI(root: HTMLElement, ctx: InspectorCtx) {
  injectStyles();
  root.classList.add("g-root");

  let tab: "boss" | "growth" | "roster" | "map" = "boss";
  let mountKey = "";

  root.addEventListener("click", (e) => {
    const target = e.target as HTMLElement;
    const tabEl = target.closest("[data-tab]") as HTMLElement | null;
    if (tabEl) {
      tab = tabEl.dataset.tab as typeof tab;
      render();
      return;
    }
    const el = target.closest("[data-action]") as HTMLElement | null;
    if (!el) return;
    const a = ctx.actions as InspectorActions;
    const id = el.dataset.id;
    switch (el.dataset.action) {
      case "circulate": a.circulate(); flashBars(["water", "warmth"]); break;
      case "purify": a.purify(); flashBars(["infl"]); break;
      case "regenerate": a.regenerate(); flashBars(["gut"]); break;
      case "attack": a.attack(); break;
      case "crisis": a.crisis(); break;
      case "meditation": a.meditation(); break;
      case "drawHero": a.drawHero(); break;
      case "useTaste": a.useTaste(); break;
      case "migrate": a.migrate(); break;
      case "startBoss": a.startBoss(id!); break;
      case "evolve": a.evolve(); break;
      case "buyUpgrade": a.buyUpgrade(id!); break;
      case "buyPermanent": a.buyPermanent(id!); break;
      case "draw": a.draw(); break;
      case "dismissOnboard":
        try { localStorage.setItem("soknara.onboarded", "1"); } catch { /* noop */ }
        break;
    }
    render();
  });

  function flashBars(keys: string[]): void {
    keys.forEach((k) => {
      const el = root.querySelector(`[data-mk="${k}"]`);
      if (el) {
        el.classList.add("flash");
        setTimeout(() => el.classList.remove("flash"), 420);
      }
    });
  }

  function bar(key: string, label: string, v01: number, color: string, danger = false): string {
    const pct = (clampMeter(v01) * 100).toFixed(0);
    return `<div class="g-bar ${danger ? "danger" : ""}" data-mk="${key}">
      <span class="g-bl">${label}</span>
      <div class="g-bt"><div class="g-bf" style="width:${pct}%;background:${color}"></div></div>
      <span class="g-bv">${v01.toFixed(2)}</span></div>`;
  }

  // 보스 HUD 동적 부분 HTML (초기 렌더 + 제자리 갱신 공용)
  function statusHtml(s: GameState): string {
    const e = s.encounter;
    if (!e) return "";
    let out = "";
    if (e.mindLock) {
      const open = mindFoundationMet(s, e.mindLock);
      out += `<div class="g-status ${open ? "ok" : "warn"}">${open ? "빛(識) 잠금 해제됨 — 이제 마음이 열린다" : "🔒 몸(장·물·온기)을 먼저 회복해야 마음이 열립니다"}</div>`;
    }
    if (e.gaugeBehavior === "stealthGrow") {
      const watched = s.meters.water >= 0.6;
      out += `<div class="g-status ${watched ? "ok" : "warn"}">${watched ? "👁 감시망 가동 — 연료를 끊어 억제하세요" : "🫥 종양 은신 중 — 물길(감시)을 올리세요"}</div>`;
    }
    return out;
  }
  function loopHtml(s: GameState): string {
    const active = feedbackLoops(s).filter((l) => l.active);
    return active.length
      ? `<div class="g-loops">🔴 악순환: ${active.map((l) => l.id).join(", ")} — 정화·재생으로 끊으세요</div>`
      : "";
  }

  function renderBoss(s: GameState): string {
    const host = HOSTS[s.campaign.hostIndex];
    const e = s.encounter;

    if (!e) {
      return `<div class="g-empty">
          <div class="g-title">속나라</div>
          <div class="g-sub">돌볼 속나라가 없습니다.</div>
          ${host ? `<button class="g-primary" data-action="startBoss" data-id="${host.boss.id}">${host.name}의 속나라로 들어가기</button>` : ""}
        </div>`;
    }

    const w = worldById(e.world);
    const worldStr = w ? `${ELEMENT_LABEL[w.element]}·${w.organ}` : e.world;
    const won = e.phase === "won";
    const gaugeOver = e.gauge > 1;

    // 페이즈 스테퍼
    const curIdx = PHASES.findIndex((p) => p.key === e.phase);
    const stepper = PHASES.map((p, i) =>
      `<div class="g-step ${i < curIdx ? "done" : i === curIdx ? "on" : ""}">${p.label}</div>`
    ).join('<span class="g-step-sep">›</span>');

    // 미터 (data-mk 로 제자리 갱신)
    const meters = (Object.keys(METER_META) as MeterKey[])
      .map((k) => bar(k, METER_META[k].label, s.meters[k], METER_META[k].color)).join("");
    const amt = tasteAmount(s, e.taste);
    const banner = e.sensitive
      ? `<div class="g-disclaimer">은유적 체험이며 의학적 조언이 아닙니다. ${e.disease}은(는) 전문적인 진단·치료가 필요합니다.</div>`
      : "";
    const overlay = won ? winOverlay(s, host) : "";

    return `<div class="g-boss">
      ${banner}
      <div class="g-host">
        <div><b>${host ? host.name : ""}</b> ${host ? `(${host.age})` : ""} <span class="g-muted">· 숙주 ${s.campaign.hostIndex + 1}/${HOSTS.length}</span></div>
        <div class="g-muted">${e.disease} · ${worldStr}${host ? ` · "${host.bio}"` : ""}</div>
      </div>

      <div class="g-stepper">${stepper}</div>

      <div class="g-gauge ${gaugeOver ? "over" : ""}" id="g-gauge">
        <div class="g-gl">${e.gaugeLabel}<span id="g-gover">${gaugeOver ? " ⚠ 넘침!" : ""}</span></div>
        <div class="g-gt"><div class="g-gf" style="width:${(Math.min(1, e.gauge) * 100).toFixed(0)}%"></div></div>
      </div>

      <div class="g-meters">${meters}${bar("infl", "염증", s.inflammation, "#ef4444", true)}</div>
      <div id="g-status">${statusHtml(s)}</div>
      <div id="g-loops">${loopHtml(s)}</div>

      <div class="g-hands">
        <button class="g-hand h-water" data-action="circulate"><span>순환</span><small>물길·온기 열기</small></button>
        <button class="g-hand h-purify" data-action="purify"><span>정화</span><small>염증·게이지 비우기</small></button>
        <button class="g-hand h-regen" data-action="regenerate"><span>재생</span><small>숲·빛·뿌리 키우기</small></button>
      </div>
      <div class="g-secondary">
        <button class="g-mini ${e.attackRaisesGauge > 0 ? "danger" : ""}" data-action="attack">공격/딜${e.attackRaisesGauge > 0 ? " ⚠자해" : ""}</button>
        <button class="g-mini ad" data-action="crisis">🎬 위기지원</button>
        <button class="g-mini ad" data-action="meditation">🎬 명상</button>
      </div>
      <div class="g-taste">
        <span>오미 ${tasteLabel(e.taste)} <b data-taste-amt>${amt.toFixed(1)}</b> · ${TASTE_EFFECT_DESC[e.taste] ?? ""}</span>
        <button class="g-mini" data-action="useTaste" ${amt >= TASTE_COST ? "" : "disabled"}>오미 사용</button></div>
      ${overlay}</div>`;
  }

  // 보스 HUD 제자리 갱신 (풀 재빌드 없이 값만 → CSS 트랜지션이 살아남)
  function updateBoss(s: GameState): void {
    const e = s.encounter;
    if (!e) return;
    const setBar = (key: string, v: number) => {
      const f = root.querySelector(`[data-mk="${key}"] .g-bf`) as HTMLElement | null;
      if (f) f.style.width = `${(clampMeter(v) * 100).toFixed(1)}%`;
      const t = root.querySelector(`[data-mk="${key}"] .g-bv`);
      if (t) t.textContent = v.toFixed(2);
    };
    (Object.keys(METER_META) as MeterKey[]).forEach((k) => setBar(k, s.meters[k]));
    setBar("infl", s.inflammation);
    const gf = root.querySelector("#g-gauge .g-gf") as HTMLElement | null;
    if (gf) gf.style.width = `${(Math.min(1, e.gauge) * 100).toFixed(1)}%`;
    const gauge = root.querySelector("#g-gauge");
    const over = e.gauge > 1;
    if (gauge) gauge.classList.toggle("over", over);
    const gover = root.querySelector("#g-gover");
    if (gover) gover.textContent = over ? " ⚠ 넘침!" : "";
    const st = root.querySelector("#g-status");
    if (st) st.innerHTML = statusHtml(s);
    const lp = root.querySelector("#g-loops");
    if (lp) lp.innerHTML = loopHtml(s);
    const amt = tasteAmount(s, e.taste);
    const ta = root.querySelector("[data-taste-amt]");
    if (ta) ta.textContent = amt.toFixed(1);
    const tb = root.querySelector('[data-action="useTaste"]') as HTMLButtonElement | null;
    if (tb) tb.disabled = amt < TASTE_COST;
  }

  // ── 탭 라우팅 ──
  function render() {
    const s = ctx.getState();
    const e = s.encounter;
    let onb = "1";
    try { onb = localStorage.getItem("soknara.onboarded") ? "1" : "0"; } catch { /* noop */ }
    const key = `${tab}|${!!e}|${e?.bossId}|${e?.phase}|${s.campaign.hostIndex}|${onb}`;
    // 구조가 그대로면 보스 HUD는 제자리 갱신 (미터/게이지 CSS 트랜지션 유지)
    if (tab === "boss" && key === mountKey && root.querySelector(".g-boss")) {
      updateBoss(s);
      return;
    }
    const body =
      tab === "growth" ? renderGrowth(s)
      : tab === "roster" ? renderRoster(s)
      : tab === "map" ? renderMap(s)
      : renderBoss(s);
    root.innerHTML = `<div class="g-screen">${body}</div>${tabBar()}${onboarding()}`;
    mountKey = key;
  }

  function heat(v: number): string {
    const c = clampMeter(v);
    return `rgb(${Math.round(230 * (1 - c) + 20)},${Math.round(200 * c + 30)},60)`;
  }

  // ── 몸지도 탭 (만류귀종) ──
  function renderMap(s: GameState): string {
    const curWorld = s.encounter?.world;
    const curBoss = s.encounter?.bossId;
    const rootNode = `<span class="gm-node" style="background:${heat(s.rootnode.diversity)}">🦠 뿌리 ${s.rootnode.diversity.toFixed(2)}</span>`;
    const gates = (Object.keys(METER_META) as MeterKey[])
      .map((k) => `<span class="gm-node" style="background:${heat(s.meters[k])}">${METER_META[k].label} ${s.meters[k].toFixed(2)}</span>`).join("");
    const worlds = WORLDS
      .map((wo) => `<span class="gm-cell ${wo.id === curWorld ? "on" : ""}">${ELEMENT_LABEL[wo.element].charAt(0)}·${wo.organ}</span>`).join("");
    const symptoms = BOSSES.map((b) => {
      const healed = s.collection.has(`boss:${b.id}`);
      const cls = b.id === curBoss ? "on" : healed ? "done" : "";
      return `<span class="gm-cell ${cls}">${healed ? "✓" : ""}${b.disease}</span>`;
    }).join("");
    const loops = feedbackLoops(s).filter((l) => l.active)
      .map((l) => `<div class="gm-loop">🔴 ${l.id} <span class="g-muted">강도 ${l.intensity.toFixed(2)} — ${l.cut}</span></div>`).join("") || `<div class="g-muted">현재 악순환 없음 — 안정</div>`;
    return `
      <div class="g-cardtitle">몸지도 (만류귀종)</div>
      <div class="g-muted" style="margin-bottom:10px">뿌리를 정비하면 하류가 스스로 약해집니다 — <b style="color:#86efac">"장부터"가 이득</b>.</div>
      <div class="gm-row">${rootNode}</div>
      <div class="gm-arrow">↓ 4출력 배급</div>
      <div class="gm-row">${gates}</div>
      <div class="gm-arrow">↓ 불균형이 장부색으로</div>
      <div class="gm-row">${worlds}</div>
      <div class="gm-arrow">↓ 하류 증상</div>
      <div class="gm-row">${symptoms}</div>
      <div class="g-card" style="margin-top:12px"><div class="g-cardh">되먹임 (악순환)</div>${loops}</div>`;
  }

  // 첫 실행 온보딩 인트로 (1회)
  function onboarding(): string {
    try {
      if (localStorage.getItem("soknara.onboarded")) return "";
    } catch {
      return "";
    }
    return `<div class="g-overlay onboard"><div class="g-intro">
      <div class="g-title">속나라</div>
      <p class="g-intro-lead">당신은 한 사람의 몸속 생태계를 돌보는 <b>이름 없는 손길</b>입니다.<br>
        무너진 균형을 <b>순환·정화·재생</b>으로 되돌리세요.</p>
      <div class="g-intro-hands">
        <div><b class="i1">순환</b> 막힌 것을 연다 <small>물길·온기</small></div>
        <div><b class="i2">정화</b> 쌓인 것을 비운다 <small>염증·게이지</small></div>
        <div><b class="i3">재생</b> 생태계를 다시 키운다 <small>숲·빛·뿌리</small></div>
      </div>
      <p class="g-intro-disc">이 게임은 몸속 생태계를 다루는 <b>은유적 체험</b>이며 <b>의학적 조언이 아닙니다</b>.
        실제 질병은 전문적인 진단과 치료가 필요합니다.</p>
      <button class="g-primary" data-action="dismissOnboard">시작하기</button>
    </div></div>`;
  }

  function tabBar(): string {
    const t = (key: string, label: string, icon: string) =>
      `<button class="g-tab ${tab === key ? "on" : ""}" data-tab="${key}"><span class="g-tab-ic">${icon}</span><span>${label}</span></button>`;
    return `<div class="g-tabbar">${t("boss", "보스전", "⚕")}${t("growth", "성장", "🌱")}${t("roster", "로스터", "🦠")}${t("map", "몸지도", "🗺")}</div>`;
  }

  // ── 성장 탭 ──
  function renderGrowth(s: GameState): string {
    const now = ctx.now();
    const g = s.generators[C.MAIN_GENERATOR_ID];
    const ep = s.resources[C.RESOURCE_IDS.EP].amount;
    const epRate = resourceRate(s, C.RESOURCE_IDS.EP, now);
    const genes = s.prestige.genes[C.PRESTIGE_CURRENCY] ?? new Decimal(0);
    const evoCost = applyCostModifiers(s, C.RESOURCE_IDS.EP, computeCost(C.TIER.cost, g.tier), now);
    const canEvo = g.tier < g.maxTier && ep.gte(evoCost);
    const ups = C.UPGRADES.map((up) => {
      const maxed = up.maxLevel !== undefined && up.level >= up.maxLevel;
      const cost = nextCost(s, up, now);
      const ok = !maxed && s.resources[up.costResource].amount.gte(cost);
      return `<button class="g-buy" data-action="buyUpgrade" data-id="${up.id}" ${ok ? "" : "disabled"}>
        <span>${up.id} <small>Lv ${up.level}${up.maxLevel ? "/" + up.maxLevel : ""}</small></span>
        <span class="g-cost">${maxed ? "MAX" : fmt(cost) + " EP"}</span></button>`;
    }).join("");
    const perms = C.PRESTIGE.permanentUpgrades.map((up) => {
      const maxed = up.maxLevel !== undefined && up.level >= up.maxLevel;
      const cost = nextCost(s, up, now);
      const ok = !maxed && genes.gte(cost);
      return `<button class="g-buy" data-action="buyPermanent" data-id="${up.id}" ${ok ? "" : "disabled"}>
        <span>${up.id} <small>Lv ${up.level}${up.maxLevel ? "/" + up.maxLevel : ""}</small></span>
        <span class="g-cost">${maxed ? "MAX" : fmt(cost) + " g"}</span></button>`;
    }).join("");
    return `
      <div class="g-cardtitle">성장 (생산 엔진)</div>
      <div class="g-statrow"><div class="g-stat"><small>EP</small><b>${fmt(ep)}</b></div>
        <div class="g-stat"><small>EP/s</small><b>${fmt(epRate)}</b></div>
        <div class="g-stat"><small>genes</small><b>${fmt(genes)}</b></div></div>
      <div class="g-card">
        <div class="g-cardh">진화 · ${g.id} tier ${g.tier}/${g.maxTier}</div>
        <button class="g-buy" data-action="evolve" ${canEvo ? "" : "disabled"}>
          <span>진화 → tier ${g.tier + 1} <small>(생산 ×${fmt(C.TIER.mult)})</small></span>
          <span class="g-cost">${g.tier >= g.maxTier ? "MAX" : fmt(evoCost) + " EP"}</span></button>
      </div>
      <div class="g-card"><div class="g-cardh">업그레이드 (EP)</div>${ups}</div>
      <div class="g-card"><div class="g-cardh">영구 트리 (genes)</div>${perms}</div>
      <div class="g-card"><div class="g-cardh">돌연변이 도감 · ${s.collection.size}종</div>
        <button class="g-buy" data-action="draw"><span>돌연변이 뽑기 <small>(무료·생산 강화)</small></span><span class="g-cost">뽑기</span></button></div>`;
  }

  // ── 로스터 탭 ──
  function renderRoster(s: GameState): string {
    const bossId = s.encounter?.bossId;
    const owned = UNITS.filter((u) => unitCount(s, u.id) > 0).length;
    const rows = UNITS.slice()
      .sort((a, b) => unitCount(s, b.id) - unitCount(s, a.id))
      .map((u) => {
        const n = unitCount(s, u.id);
        const rel = isRelevant(u, bossId);
        return `<div class="g-unit ${n > 0 ? "" : "dim"}">
          <span class="g-uart ${n > 0 ? "" : "locked"}">${unitAvatar(u, 46)}</span>
          <div class="g-utxt">
            <div><span class="${rel ? "g-rel" : ""}">${rel ? "★ " : ""}${u.name}</span>
              <small class="r-${u.rarity}"> ${u.rarity}</small>${n > 0 ? ` <b>×${n}</b>` : ""}</div>
            <small class="g-muted">${u.role}</small>
          </div></div>`;
      }).join("");
    return `
      <div class="g-cardtitle">히어로 로스터 <span class="g-muted">${owned}/${UNITS.length}</span></div>
      <button class="g-primary" data-action="drawHero">🎬 히어로 뽑기 (광고)</button>
      <div class="g-muted" style="margin:8px 0">★ = 현재 보스에 특히 유효 · 배치 수만큼 스택 · 이주해도 유지</div>
      <div class="g-units">${rows}</div>`;
  }

  function winOverlay(s: GameState, host: (typeof HOSTS)[number] | undefined): string {
    const e = s.encounter!;
    const nextHost = HOSTS[s.campaign.hostIndex + 1];
    const gain = C.genesGain(s);
    const healedCount = BOSSES.filter((b) => s.collection.has(`boss:${b.id}`)).length;
    return `<div class="g-overlay"><div class="g-result">
      <div class="g-result-t">🟢 항상성 복원</div>
      <div class="g-result-cut">${host ? `${host.name} — "${host.recoveryCut}"` : ""}</div>
      <div class="g-result-frame">증상을 없앤 게 아니라, 뿌리를 정비해 <b>몸이 스스로 균형을 되찾기 시작</b>했다.</div>
      <div class="g-result-rows">
        <div>🏅 치유 지혜 획득 (영구)</div>
        <div>🧬 genes +${fmt(gain)} · 도감 ${healedCount}/${BOSSES.length}</div>
      </div>
      ${nextHost
        ? `<button class="g-primary" data-action="migrate">다음 사람에게 이주 → ${nextHost.name}</button>`
        : `<div class="g-muted">모든 숙주 완료 — 캠페인 클리어 🎉</div>`}
    </div></div>`;
  }

  return { render };
}

let injected = false;
function injectStyles() {
  if (injected) return;
  injected = true;
  const css = `
  .g-root { max-width:480px; margin:0 auto; font-family:-apple-system, system-ui, "Segoe UI", Roboto, "Noto Sans KR", sans-serif; }
  .g-screen { padding:12px 14px 80px; position:relative; min-height:100vh; box-sizing:border-box; }
  .g-muted { color:#8b96a5; font-size:12px; }
  .g-empty { text-align:center; padding-top:30vh; }
  .g-title { font-size:34px; font-weight:800; letter-spacing:4px; color:#e8eef5; }
  .g-sub { color:#8b96a5; margin:8px 0 20px; }
  .g-disclaimer { background:#3a2e12; border:1px solid #7c5e10; color:#fde68a; font-size:11px; border-radius:8px; padding:8px 10px; margin-bottom:10px; line-height:1.5; }
  .g-host { background:#12161c; border:1px solid #232b35; border-radius:10px; padding:10px 12px; margin-bottom:10px; }
  .g-host b { color:#e8eef5; font-size:15px; }
  .g-stepper { display:flex; align-items:center; justify-content:center; gap:2px; margin:12px 0; }
  .g-step { font-size:12px; padding:4px 10px; border-radius:14px; color:#5b6472; border:1px solid #232b35; }
  .g-step.on { color:#0a0f14; background:#4ade80; border-color:#4ade80; font-weight:700; }
  .g-step.done { color:#4ade80; border-color:#1f5133; }
  .g-step-sep { color:#39424e; font-size:12px; }
  .g-gauge { margin:10px 0; }
  .g-gauge .g-gl { font-size:12px; color:#eab308; margin-bottom:3px; }
  .g-gauge.over .g-gl { color:#ef4444; }
  .g-gt { height:14px; background:#0e1319; border:1px solid #232b35; border-radius:8px; overflow:hidden; }
  .g-gf { height:100%; background:linear-gradient(90deg,#eab308,#f59e0b); transition:width .2s; }
  .g-gauge.over .g-gf { background:#ef4444; }
  .g-meters { display:flex; flex-direction:column; gap:6px; margin:12px 0; }
  .g-bar { display:flex; align-items:center; gap:8px; }
  .g-bar .g-bl { width:40px; font-size:13px; color:#cbd5e1; }
  .g-bar .g-bt { flex:1; height:14px; background:#0e1319; border:1px solid #232b35; border-radius:8px; overflow:hidden; }
  .g-bar .g-bf { height:100%; transition:width .2s; border-radius:8px; }
  .g-bar .g-bv { width:36px; text-align:right; font-size:12px; color:#8b96a5; }
  .g-bar.danger .g-bl { color:#fca5a5; }
  .g-status { font-size:12px; padding:6px 10px; border-radius:8px; margin:6px 0; }
  .g-status.warn { background:#2a1e12; color:#fbbf24; border:1px solid #5b3f14; }
  .g-status.ok { background:#0e2417; color:#86efac; border:1px solid #1f5133; }
  .g-loops { font-size:12px; color:#fca5a5; background:#2a1414; border:1px solid #5b2020; border-radius:8px; padding:6px 10px; margin:6px 0; }
  .g-hands { display:grid; grid-template-columns:repeat(3,1fr); gap:8px; margin:14px 0 8px; }
  .g-hand { display:flex; flex-direction:column; align-items:center; gap:2px; padding:14px 6px; border-radius:12px; border:none; cursor:pointer; color:#0a0f14; font-weight:800; }
  .g-hand span { font-size:16px; }
  .g-hand small { font-size:10px; font-weight:600; opacity:.8; }
  .g-hand.h-water { background:linear-gradient(160deg,#7dd3fc,#38bdf8); }
  .g-hand.h-purify { background:linear-gradient(160deg,#fca5a5,#f87171); }
  .g-hand.h-regen { background:linear-gradient(160deg,#86efac,#4ade80); }
  .g-hand:active { transform:translateY(1px); }
  .g-secondary { display:flex; flex-wrap:wrap; gap:6px; margin:6px 0; }
  .g-mini { background:#1b222b; color:#cbd5e1; border:1px solid #2b3540; border-radius:8px; padding:7px 11px; font-size:12px; cursor:pointer; }
  .g-mini:active { transform:translateY(1px); }
  .g-mini:disabled { opacity:.4; }
  .g-mini.ad { background:#17233a; border-color:#25406b; color:#bfdbfe; }
  .g-mini.danger { background:#3f1d1d; border-color:#742a2a; color:#fca5a5; }
  .g-taste { display:flex; align-items:center; justify-content:space-between; gap:8px; font-size:12px; color:#cbd5e1; margin:8px 0; }
  .g-primary { display:block; width:100%; background:linear-gradient(160deg,#22c55e,#16a34a); color:#04240f; font-weight:800; border:none; border-radius:12px; padding:14px; font-size:15px; cursor:pointer; margin-top:8px; }
  .g-overlay { position:fixed; inset:0; background:rgba(4,8,12,.82); display:flex; align-items:center; justify-content:center; padding:20px; z-index:20; }
  .g-result { max-width:400px; width:100%; background:#0e1a12; border:1px solid #1f5133; border-radius:16px; padding:20px; text-align:center; }
  .g-result-t { color:#4ade80; font-size:20px; font-weight:800; }
  .g-result-cut { color:#dcfce7; font-style:italic; margin:10px 0; font-size:14px; line-height:1.5; }
  .g-result-frame { color:#86efac; font-size:12px; line-height:1.6; margin-bottom:10px; }
  .g-result-frame b { color:#bbf7d0; }
  .g-result-rows { font-size:13px; color:#cbd5e1; display:flex; flex-direction:column; gap:3px; margin-bottom:12px; }
  .g-tabbar { position:fixed; bottom:0; left:0; right:0; max-width:480px; margin:0 auto; display:flex; background:#0c1015; border-top:1px solid #232b35; z-index:15; }
  .g-tab { flex:1; display:flex; flex-direction:column; align-items:center; gap:2px; padding:9px 0 10px; background:none; border:none; color:#5b6472; font:inherit; font-size:11px; cursor:pointer; }
  .g-tab-ic { font-size:18px; filter:grayscale(1) opacity(.6); }
  .g-tab.on { color:#4ade80; }
  .g-tab.on .g-tab-ic { filter:none; }
  .g-cardtitle { font-size:16px; font-weight:700; color:#e8eef5; margin:6px 0 10px; }
  .g-statrow { display:flex; gap:8px; margin-bottom:10px; }
  .g-stat { flex:1; background:#12161c; border:1px solid #232b35; border-radius:8px; padding:8px; text-align:center; }
  .g-stat small { display:block; color:#8b96a5; font-size:10px; }
  .g-stat b { color:#e8eef5; font-size:15px; }
  .g-card { background:#12161c; border:1px solid #232b35; border-radius:10px; padding:10px 12px; margin-bottom:10px; }
  .g-cardh { font-size:12px; color:#8b96a5; margin-bottom:7px; }
  .g-buy { display:flex; justify-content:space-between; align-items:center; width:100%; background:#171d25; border:1px solid #2b3540; border-radius:8px; padding:10px 12px; margin-bottom:6px; color:#dbe4ee; font:inherit; font-size:13px; cursor:pointer; text-align:left; }
  .g-buy:last-child { margin-bottom:0; }
  .g-buy small { color:#8b96a5; }
  .g-buy:disabled { opacity:.4; }
  .g-buy:active:not(:disabled) { transform:translateY(1px); }
  .g-cost { color:#4ade80; font-weight:700; white-space:nowrap; }
  .g-units { display:flex; flex-direction:column; gap:6px; }
  .g-unit { background:#12161c; border:1px solid #232b35; border-radius:8px; padding:8px 12px; display:flex; align-items:center; gap:10px; }
  .g-unit.dim { opacity:.62; }
  .g-uart { flex:0 0 auto; width:46px; height:46px; display:flex; align-items:center; justify-content:center; filter:drop-shadow(0 1px 2px rgba(0,0,0,.35)); }
  .g-uart.locked { filter:grayscale(1) brightness(.72); opacity:.7; }
  .g-utxt { min-width:0; }
  .g-unit b { color:#e8eef5; }
  .g-rel { color:#86efac; }
  .r-common { color:#9ca3af; } .r-rare { color:#60a5fa; } .r-epic { color:#c084fc; } .r-legendary { color:#fbbf24; }
  .g-overlay.onboard { z-index:40; }
  .g-intro { max-width:400px; width:100%; background:#0c1219; border:1px solid #232b35; border-radius:16px; padding:24px 20px; text-align:center; }
  .g-intro .g-title { font-size:30px; letter-spacing:5px; margin-bottom:14px; }
  .g-intro-lead { color:#cbd5e1; font-size:14px; line-height:1.7; margin:0 0 16px; }
  .g-intro-lead b { color:#86efac; }
  .g-intro-hands { text-align:left; background:#12161c; border:1px solid #232b35; border-radius:10px; padding:12px 14px; margin:0 0 14px; font-size:13px; color:#cbd5e1; display:flex; flex-direction:column; gap:7px; }
  .g-intro-hands small { color:#8b96a5; }
  .g-intro-hands .i1 { color:#38bdf8; } .g-intro-hands .i2 { color:#f87171; } .g-intro-hands .i3 { color:#4ade80; }
  .g-intro-disc { font-size:11px; color:#fbbf24; line-height:1.6; margin:0 0 16px; }
  .g-intro-disc b { color:#fde68a; }
  .gm-row { display:flex; flex-wrap:wrap; gap:5px; justify-content:center; margin:3px 0; }
  .gm-arrow { text-align:center; color:#5b6472; font-size:11px; margin:2px 0; }
  .gm-node { font-size:11px; padding:3px 9px; border-radius:12px; color:#0a0f14; font-weight:700; }
  .gm-cell { font-size:11px; padding:3px 8px; border-radius:6px; border:1px solid #2b3540; color:#8b96a5; }
  .gm-cell.on { border-color:#4ade80; color:#dcfce7; background:#14532d; font-weight:700; }
  .gm-cell.done { color:#86efac; border-color:#1f5133; }
  .gm-loop { font-size:12px; color:#fca5a5; padding:3px 0; }
  .g-screen { background:radial-gradient(130% 55% at 50% 0%, #131b26 0%, #0b0e13 62%); }
  @keyframes gpulse { 0%,100%{opacity:1} 50%{opacity:.5} }
  .g-gauge.over .g-gf, .g-gauge.over .g-gl { animation:gpulse .8s ease-in-out infinite; }
  @keyframes gfade { from{opacity:0} to{opacity:1} }
  @keyframes gpop { from{opacity:0; transform:scale(.92) translateY(6px)} to{opacity:1; transform:none} }
  .g-overlay { animation:gfade .22s ease-out; }
  .g-result, .g-intro { animation:gpop .3s cubic-bezier(.2,.8,.2,1); }
  .g-hand { box-shadow:0 3px 0 rgba(0,0,0,.28); }
  .g-hand:active { box-shadow:0 1px 0 rgba(0,0,0,.28); }
  .g-bf, .g-gf { transition:width .28s cubic-bezier(.3,.7,.2,1) !important; }
  @keyframes gflash { 0%{background:rgba(255,255,255,.16)} 100%{background:transparent} }
  .g-bar.flash { animation:gflash .42s ease-out; border-radius:8px; }
  `;
  const style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);
}
