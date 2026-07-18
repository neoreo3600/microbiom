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
import { unitAvatar, worldBackdrop, bossEmblem, hostPortrait } from "./art";
import { sfx, floatText, burst, confetti, initSoundToggle } from "./juice";
import { tasteAmount, TASTE_COST } from "../engine/taste";
import type { InspectorActions, InspectorCtx } from "../debug/inspector";
import { fmt } from "../debug/format";

const METER_META: Record<MeterKey, { label: string; color: string }> = {
  gut: { label: "숲", color: "#4ade80" },
  water: { label: "물길", color: "#38bdf8" },
  warmth: { label: "온기", color: "#fb923c" },
  mind: { label: "빛", color: "#c084fc" },
};

const UP_ICON: Record<string, string> = {
  metabolism: "🔥", enzyme: "🧪", division: "🧫", symbiosis: "🤝",
  core: "🧬", replicate: "♻️", flux: "🌊", membrane: "🛡", cortisol: "🌙",
};

const PHASES: { key: string; label: string }[] = [
  { key: "circulation", label: "순환" },
  { key: "purification", label: "정화" },
  { key: "regeneration", label: "재생" },
  { key: "won", label: "회복" },
];

export function createGameUI(root: HTMLElement, ctx: InspectorCtx) {
  injectStyles();
  initSoundToggle();
  root.classList.add("g-root");

  let tab: "boss" | "growth" | "roster" | "map" = "boss";
  let mountKey = "";
  // 페이즈/승리 전환 감지용 (연출 1회 발화)
  let prevPhase: string | undefined;
  let prevBoss: string | undefined;
  const PHASE_ORDER = ["circulation", "purification", "regeneration", "won"];

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
    // 탭 지점 기준 이펙트 헬퍼
    const fx = (color: string, label: string) => {
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      burst(cx, r.top + r.height / 2, color);
      floatText(cx, r.top, label, color);
    };
    switch (el.dataset.action) {
      case "circulate": a.circulate(); flashBars(["water", "warmth"]); sfx.circulate(); fx("#6cc6f5", "💧 물길·온기 ▲"); break;
      case "purify": a.purify(); flashBars(["infl"]); sfx.purify(); fx("#ff8f9c", "🫧 염증·게이지 ▼"); break;
      case "regenerate": a.regenerate(); flashBars(["gut"]); sfx.regen(); fx("#6fe0a6", "🌱 숲·빛·뿌리 ▲"); break;
      case "attack":
        a.attack();
        if (el.classList.contains("danger")) { sfx.blocked(); fx("#ff8f9c", "⚠ 자해"); } else { sfx.chime(); }
        break;
      case "crisis": a.crisis(); sfx.chime(); break;
      case "meditation": a.meditation(); sfx.chime(); break;
      case "drawHero": a.drawHero(); sfx.chime(); break;
      case "useTaste": a.useTaste(); sfx.chime(); fx("#ffd36b", "✨ 오미 사용"); break;
      case "migrate": a.migrate(); sfx.chime(); break;
      case "startBoss": a.startBoss(id!); break;
      case "evolve": a.evolve(); sfx.chime(); break;
      case "buyUpgrade": a.buyUpgrade(id!); sfx.chime(); break;
      case "buyPermanent": a.buyPermanent(id!); sfx.chime(); break;
      case "draw": a.draw(); sfx.chime(); break;
      case "dismissOnboard":
        try { localStorage.setItem("soknara.onboarded", "1"); } catch { /* noop */ }
        break;
    }
    render();
  });

  // 페이즈 전진(순→정→재→승리)에 연출·사운드 1회
  function detectPhase(e?: { phase: string; bossId: string }): void {
    if (!e) { prevPhase = undefined; prevBoss = undefined; return; }
    if (e.bossId === prevBoss && prevPhase) {
      const pi = PHASE_ORDER.indexOf(prevPhase);
      const ci = PHASE_ORDER.indexOf(e.phase);
      if (ci > pi) {
        if (e.phase === "won") { sfx.win(); confetti(); }
        else { sfx.phase(); burst(window.innerWidth / 2, 150, "#ffd36b", 14); }
      }
    }
    prevPhase = e.phase;
    prevBoss = e.bossId;
  }

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
      <div class="g-host g-hostrow">
        <span class="g-avatar" title="${host ? host.name : ""} — ${e.disease}">
          ${host ? hostPortrait(host.id, 52) : ""}
          <span class="g-avatar-badge">${bossEmblem({ id: e.bossId, element: w?.element, behavior: e.gaugeBehavior, size: 26 })}</span>
        </span>
        <div class="g-hosttxt">
          <div><b>${host ? host.name : ""}</b> ${host ? `(${host.age})` : ""} <span class="g-muted">· 숙주 ${s.campaign.hostIndex + 1}/${HOSTS.length}</span></div>
          <div class="g-muted">${e.disease} · ${worldStr}${host ? ` · "${host.bio}"` : ""}</div>
        </div>
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
    detectPhase(e);
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
    // 보스전에는 그 월드의 오행 배경을 깐다 (카드는 불투명이라 가독성 유지)
    const backdrop = tab === "boss" && e
      ? `<div class="g-backdrop">${worldBackdrop(worldById(e.world)?.element)}</div>`
      : "";
    root.innerHTML = `<div class="g-screen ${backdrop ? "has-bg" : ""}">${backdrop}${body}</div>${tabBar()}${onboarding()}`;
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
    const cast = ["lacto", "akker", "treg", "apex"]
      .map((id) => UNITS.find((u) => u.id === id))
      .filter((u): u is (typeof UNITS)[number] => !!u)
      .map((u) => `<span>${unitAvatar(u, 46)}</span>`).join("");
    const faces = HOSTS.map((h) => `<span>${hostPortrait(h.id, 34)}</span>`).join("");
    return `<div class="g-overlay onboard"><div class="g-intro">
      <div class="g-intro-cast">${cast}</div>
      <div class="g-title">속나라</div>
      <p class="g-intro-lead">당신은 한 사람의 몸속 생태계를 돌보는 <b>이름 없는 손길</b>입니다.<br>
        무너진 균형을 <b>순환·정화·재생</b>으로 되돌리세요.</p>
      <div class="g-intro-hands">
        <div><b class="i1">💧 순환</b> 막힌 것을 연다 <small>물길·온기</small></div>
        <div><b class="i2">🫧 정화</b> 쌓인 것을 비운다 <small>염증·게이지</small></div>
        <div><b class="i3">🌱 재생</b> 생태계를 다시 키운다 <small>숲·빛·뿌리</small></div>
      </div>
      <div class="g-intro-faces"><small class="g-muted">당신이 도울 사람들</small><div class="ff">${faces}</div></div>
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
    const icon = (id: string) => UP_ICON[id] ?? "✨";
    const ups = C.UPGRADES.map((up) => {
      const maxed = up.maxLevel !== undefined && up.level >= up.maxLevel;
      const cost = nextCost(s, up, now);
      const ok = !maxed && s.resources[up.costResource].amount.gte(cost);
      return `<button class="g-buy" data-action="buyUpgrade" data-id="${up.id}" ${ok ? "" : "disabled"}>
        <span><span class="g-buy-ic">${icon(up.id)}</span>${up.id} <small>Lv ${up.level}${up.maxLevel ? "/" + up.maxLevel : ""}</small></span>
        <span class="g-cost">${maxed ? "MAX" : fmt(cost) + " EP"}</span></button>`;
    }).join("");
    const perms = C.PRESTIGE.permanentUpgrades.map((up) => {
      const maxed = up.maxLevel !== undefined && up.level >= up.maxLevel;
      const cost = nextCost(s, up, now);
      const ok = !maxed && genes.gte(cost);
      return `<button class="g-buy" data-action="buyPermanent" data-id="${up.id}" ${ok ? "" : "disabled"}>
        <span><span class="g-buy-ic">${icon(up.id)}</span>${up.id} <small>Lv ${up.level}${up.maxLevel ? "/" + up.maxLevel : ""}</small></span>
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
          <span><span class="g-buy-ic">🧫</span>진화 → tier ${g.tier + 1} <small>(생산 ×${fmt(C.TIER.mult)})</small></span>
          <span class="g-cost">${g.tier >= g.maxTier ? "MAX" : fmt(evoCost) + " EP"}</span></button>
      </div>
      <div class="g-card"><div class="g-cardh">업그레이드 (EP)</div>${ups}</div>
      <div class="g-card"><div class="g-cardh">영구 트리 (genes)</div>${perms}</div>
      <div class="g-card"><div class="g-cardh">돌연변이 도감 · ${s.collection.size}종</div>
        <button class="g-buy" data-action="draw"><span><span class="g-buy-ic">🧬</span>돌연변이 뽑기 <small>(무료·생산 강화)</small></span><span class="g-cost">뽑기</span></button></div>`;
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
        return `<div class="g-unit ${n > 0 ? `own rb-${u.rarity}` : "dim"}">
          <span class="g-uart ${n > 0 ? "" : "locked"}">${unitAvatar(u, 46)}</span>
          <div class="g-utxt">
            <div><span class="${rel ? "g-rel" : ""}">${rel ? "★ " : ""}${u.name}</span>
              <small class="r-${u.rarity}"> ${u.rarity}</small>${n > 0 ? ` <b>×${n}</b>` : ""}</div>
            <small class="g-muted">${u.role}</small>
          </div></div>`;
      }).join("");
    const pct = ((owned / UNITS.length) * 100).toFixed(0);
    return `
      <div class="g-cardtitle">히어로 로스터 <span class="g-muted">${owned}/${UNITS.length}</span></div>
      <div class="g-progress"><div class="g-progress-f" style="width:${pct}%"></div></div>
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
      ${host ? `<div class="g-result-portrait">${hostPortrait(host.id, 92)}</div>` : ""}
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
  .g-root {
    --font-display:'Jua','Noto Sans KR',system-ui,sans-serif;
    --font-body:'Noto Sans KR',-apple-system,system-ui,sans-serif;
    --bg-0:#17141c; --bg-1:#241f2c;
    --surface:#2b2634; --surface-2:#352f40; --line:#413a4f;
    --ink:#f5f0f7; --ink-dim:#ada3ba;
    --radius:14px; --radius-lg:20px; --pill:999px;
    --sh-sm:0 2px 7px rgba(0,0,0,.30); --sh-md:0 10px 26px rgba(0,0,0,.36);
    --hi:inset 0 1px 0 rgba(255,255,255,.05);
    --mint:#6fe0a6; --sky:#6cc6f5; --peach:#ffb27a; --lilac:#c9a2f7; --honey:#ffd36b; --coral:#ff8f9c;
    max-width:480px; margin:0 auto; font-family:var(--font-body); color:var(--ink);
    -webkit-tap-highlight-color:transparent;
  }
  .g-root button { font-family:var(--font-body); }
  .g-screen { padding:14px 15px 84px; position:relative; min-height:100vh; box-sizing:border-box; }
  .g-muted { color:var(--ink-dim); font-size:12px; }
  .g-empty { text-align:center; padding-top:30vh; }
  .g-title { font-family:var(--font-display); font-size:40px; letter-spacing:3px; color:var(--ink); text-shadow:0 2px 12px rgba(201,162,247,.3); }
  .g-sub { color:var(--ink-dim); margin:8px 0 20px; }
  .g-disclaimer { background:rgba(255,211,107,.1); border:1px solid rgba(255,211,107,.32); color:#ffe6a3; font-size:11px; border-radius:var(--radius); padding:9px 12px; margin-bottom:11px; line-height:1.55; }
  .g-host { background:var(--surface); border-radius:var(--radius-lg); padding:12px 14px; margin-bottom:11px; box-shadow:var(--sh-sm),var(--hi); }
  .g-hostrow { display:flex; align-items:center; gap:12px; }
  .g-hosttxt { min-width:0; padding-right:44px; }
  .g-emblem { flex:0 0 auto; width:54px; height:54px; filter:drop-shadow(0 2px 5px rgba(0,0,0,.4)); }
  .g-avatar { flex:0 0 auto; position:relative; width:52px; height:52px; filter:drop-shadow(0 2px 5px rgba(0,0,0,.4)); }
  .g-avatar-badge { position:absolute; right:-5px; bottom:-5px; width:26px; height:26px; filter:drop-shadow(0 1px 2px rgba(0,0,0,.5)); }
  .g-result-portrait { display:flex; justify-content:center; margin-bottom:10px; filter:drop-shadow(0 4px 12px rgba(0,0,0,.4)); animation:gpop .4s cubic-bezier(.2,.9,.25,1); }
  .g-host b { font-family:var(--font-display); color:var(--ink); font-size:17px; font-weight:400; letter-spacing:.5px; }
  .g-stepper { display:flex; align-items:center; justify-content:center; gap:3px; margin:14px 0; }
  .g-step { font-size:12px; padding:5px 12px; border-radius:var(--pill); color:var(--ink-dim); background:var(--surface-2); transition:all .25s; }
  .g-step.on { color:#1c2b1f; background:linear-gradient(160deg,#8fe9b6,var(--mint)); font-family:var(--font-display); padding:6px 15px; box-shadow:0 3px 10px rgba(111,224,166,.4); transform:scale(1.06); }
  .g-step.done { color:var(--mint); }
  .g-step-sep { color:#5b5468; font-size:11px; }
  .g-gauge { margin:12px 0; }
  .g-gauge .g-gl { display:inline-block; font-size:11px; color:#3a2f16; background:var(--honey); padding:2px 10px; border-radius:var(--pill); margin-bottom:5px; font-weight:700; }
  .g-gauge.over .g-gl { background:var(--coral); color:#3a1116; }
  .g-gt { height:17px; background:rgba(0,0,0,.28); border-radius:var(--pill); overflow:hidden; box-shadow:inset 0 2px 4px rgba(0,0,0,.35); }
  .g-gf { height:100%; background:linear-gradient(90deg,var(--honey),var(--peach)); border-radius:var(--pill); }
  .g-gauge.over .g-gf { background:linear-gradient(90deg,var(--coral),#ff6b7d); }
  .g-meters { display:flex; flex-direction:column; gap:8px; margin:13px 0; }
  .g-bar { display:flex; align-items:center; gap:9px; }
  .g-bar .g-bl { width:42px; font-size:13px; color:var(--ink); font-weight:500; }
  .g-bar .g-bt { flex:1; height:17px; background:rgba(0,0,0,.28); border-radius:var(--pill); overflow:hidden; box-shadow:inset 0 2px 4px rgba(0,0,0,.35); }
  .g-bar .g-bf { height:100%; border-radius:var(--pill); box-shadow:inset 0 1px 0 rgba(255,255,255,.35); }
  .g-bar .g-bv { width:38px; text-align:right; font-family:var(--font-display); font-size:13px; color:var(--ink-dim); }
  .g-bar.danger .g-bl { color:var(--coral); }
  .g-status { font-size:12px; padding:8px 12px; border-radius:var(--radius); margin:7px 0; }
  .g-status.warn { background:rgba(255,179,122,.12); color:var(--peach); }
  .g-status.ok { background:rgba(111,224,166,.12); color:var(--mint); }
  .g-loops { font-size:12px; color:var(--coral); background:rgba(255,143,156,.1); border-radius:var(--radius); padding:8px 12px; margin:7px 0; }
  .g-hands { display:grid; grid-template-columns:repeat(3,1fr); gap:10px; margin:16px 0 10px; }
  .g-hand { display:flex; flex-direction:column; align-items:center; gap:3px; padding:16px 6px 14px; border-radius:var(--radius-lg); border:none; cursor:pointer; color:#1e2420; font-family:var(--font-display); position:relative; }
  .g-hand::before { font-size:22px; line-height:1; }
  .g-hand.h-water::before { content:"💧"; } .g-hand.h-purify::before { content:"🫧"; } .g-hand.h-regen::before { content:"🌱"; }
  .g-hand span { font-size:16px; letter-spacing:.5px; }
  .g-hand small { font-size:10px; font-family:var(--font-body); font-weight:600; opacity:.72; }
  .g-hand.h-water { background:linear-gradient(165deg,#9bd8fb,var(--sky)); }
  .g-hand.h-purify { background:linear-gradient(165deg,#ffc2ca,var(--coral)); }
  .g-hand.h-regen { background:linear-gradient(165deg,#9bedc2,var(--mint)); }
  .g-secondary { display:flex; flex-wrap:wrap; gap:7px; margin:8px 0; }
  .g-mini { background:var(--surface-2); color:var(--ink); border:none; border-radius:var(--pill); padding:9px 14px; font-size:12px; cursor:pointer; box-shadow:var(--sh-sm); transition:transform .08s; }
  .g-mini:active { transform:translateY(1px) scale(.98); }
  .g-mini:disabled { opacity:.4; }
  .g-mini.ad { background:linear-gradient(160deg,#8db4f0,var(--sky)); color:#12233f; font-weight:700; }
  .g-mini.danger { background:rgba(255,143,156,.16); color:var(--coral); }
  .g-taste { display:flex; align-items:center; justify-content:space-between; gap:9px; font-size:12px; color:var(--ink); margin:10px 0; background:var(--surface); border-radius:var(--radius); padding:9px 12px; box-shadow:var(--hi); }
  .g-taste b { font-family:var(--font-display); color:var(--honey); }
  .g-primary { display:block; width:100%; background:linear-gradient(165deg,#8fe9b6,var(--mint)); color:#173524; font-family:var(--font-display); font-size:17px; letter-spacing:.5px; border:none; border-radius:var(--radius-lg); padding:16px; cursor:pointer; margin-top:10px; box-shadow:0 5px 0 #3fae74,var(--sh-md); transition:transform .08s,box-shadow .08s; }
  .g-primary:active { transform:translateY(3px); box-shadow:0 2px 0 #3fae74,var(--sh-sm); }
  .g-overlay { position:fixed; inset:0; background:rgba(15,10,20,.8); backdrop-filter:blur(3px); display:flex; align-items:center; justify-content:center; padding:20px; z-index:20; }
  .g-result { max-width:400px; width:100%; background:var(--surface); border-radius:var(--radius-lg); padding:24px 22px; text-align:center; box-shadow:var(--sh-md),var(--hi); }
  .g-result-t { font-family:var(--font-display); color:var(--mint); font-size:24px; letter-spacing:1px; }
  .g-result-cut { color:var(--ink); font-style:italic; margin:12px 0; font-size:14px; line-height:1.55; }
  .g-result-frame { color:var(--mint); font-size:12px; line-height:1.6; margin-bottom:12px; }
  .g-result-frame b { color:#bbf7d0; }
  .g-result-rows { font-size:13px; color:var(--ink); display:flex; flex-direction:column; gap:4px; margin-bottom:14px; }
  .g-tabbar { position:fixed; bottom:0; left:0; right:0; max-width:480px; margin:0 auto; display:flex; background:rgba(36,31,44,.92); backdrop-filter:blur(10px); border-top:1px solid var(--line); border-radius:22px 22px 0 0; z-index:15; box-shadow:0 -6px 20px rgba(0,0,0,.28); }
  .g-tab { flex:1; display:flex; flex-direction:column; align-items:center; gap:3px; padding:10px 0 12px; background:none; border:none; color:var(--ink-dim); font:inherit; font-size:11px; cursor:pointer; transition:color .2s; }
  .g-tab-ic { font-size:19px; filter:grayscale(1) opacity(.55); transition:transform .2s,filter .2s; }
  .g-tab.on { color:var(--mint); font-weight:700; }
  .g-tab.on .g-tab-ic { filter:none; transform:translateY(-2px) scale(1.15); }
  .g-cardtitle { font-family:var(--font-display); font-size:19px; color:var(--ink); margin:6px 0 12px; letter-spacing:.5px; }
  .g-statrow { display:flex; gap:9px; margin-bottom:11px; }
  .g-stat { flex:1; background:var(--surface); border-radius:var(--radius); padding:10px; text-align:center; box-shadow:var(--sh-sm),var(--hi); }
  .g-stat small { display:block; color:var(--ink-dim); font-size:10px; }
  .g-stat b { font-family:var(--font-display); color:var(--ink); font-size:17px; }
  .g-card { background:var(--surface); border-radius:var(--radius-lg); padding:12px 14px; margin-bottom:11px; box-shadow:var(--sh-sm),var(--hi); }
  .g-cardh { font-size:12px; color:var(--ink-dim); margin-bottom:8px; }
  .g-buy { display:flex; justify-content:space-between; align-items:center; width:100%; background:var(--surface-2); border:none; border-radius:var(--radius); padding:12px 14px; margin-bottom:7px; color:var(--ink); font:inherit; font-size:13px; cursor:pointer; text-align:left; box-shadow:var(--hi); transition:transform .08s; }
  .g-buy:last-child { margin-bottom:0; }
  .g-buy small { color:var(--ink-dim); }
  .g-buy:disabled { opacity:.4; }
  .g-buy:active:not(:disabled) { transform:translateY(1px) scale(.99); }
  .g-cost { font-family:var(--font-display); color:var(--mint); white-space:nowrap; }
  .g-units { display:flex; flex-direction:column; gap:8px; }
  .g-unit { background:var(--surface); border-radius:var(--radius); padding:9px 13px; display:flex; align-items:center; gap:11px; box-shadow:var(--sh-sm),var(--hi); }
  .g-unit.dim { opacity:.6; }
  .g-unit.own { border-left:3px solid var(--line); }
  .g-unit.rb-common { border-left-color:#a49bb0; }
  .g-unit.rb-rare { border-left-color:var(--sky); }
  .g-unit.rb-epic { border-left-color:var(--lilac); }
  .g-unit.rb-legendary { border-left-color:var(--honey); box-shadow:0 0 0 1px rgba(255,211,107,.25),var(--sh-sm),var(--hi); }
  .g-progress { height:8px; background:rgba(0,0,0,.28); border-radius:var(--pill); overflow:hidden; margin-bottom:10px; box-shadow:inset 0 1px 3px rgba(0,0,0,.35); }
  .g-progress-f { height:100%; background:linear-gradient(90deg,var(--mint),var(--sky)); border-radius:var(--pill); transition:width .5s cubic-bezier(.34,1.2,.5,1); }
  .g-buy-ic { display:inline-block; width:20px; text-align:center; margin-right:4px; }
  .g-intro-cast { display:flex; justify-content:center; gap:4px; margin-bottom:4px; }
  .g-intro-cast span { filter:drop-shadow(0 2px 4px rgba(0,0,0,.35)); }
  .g-intro-faces { text-align:center; margin:2px 0 14px; }
  .g-intro-faces .ff { display:flex; justify-content:center; gap:4px; margin-top:5px; }
  .g-intro-faces .ff span { filter:drop-shadow(0 1px 3px rgba(0,0,0,.35)); }
  .g-uart { flex:0 0 auto; width:46px; height:46px; display:flex; align-items:center; justify-content:center; filter:drop-shadow(0 2px 3px rgba(0,0,0,.35)); }
  .g-uart.locked { filter:grayscale(1) brightness(.72); opacity:.7; }
  .g-utxt { min-width:0; }
  .g-unit b { font-family:var(--font-display); color:var(--ink); }
  .g-rel { color:var(--mint); }
  .r-common { color:#a49bb0; } .r-rare { color:var(--sky); } .r-epic { color:var(--lilac); } .r-legendary { color:var(--honey); }
  .g-overlay.onboard { z-index:40; }
  .g-intro { max-width:400px; width:100%; background:var(--surface); border-radius:var(--radius-lg); padding:26px 22px; text-align:center; box-shadow:var(--sh-md),var(--hi); }
  .g-intro .g-title { font-size:36px; letter-spacing:4px; margin-bottom:16px; }
  .g-intro-lead { color:var(--ink); font-size:14px; line-height:1.75; margin:0 0 18px; }
  .g-intro-lead b { color:var(--mint); }
  .g-intro-hands { text-align:left; background:var(--surface-2); border-radius:var(--radius); padding:14px 16px; margin:0 0 16px; font-size:13px; color:var(--ink); display:flex; flex-direction:column; gap:8px; }
  .g-intro-hands b { font-family:var(--font-display); }
  .g-intro-hands small { color:var(--ink-dim); }
  .g-intro-hands .i1 { color:var(--sky); } .g-intro-hands .i2 { color:var(--coral); } .g-intro-hands .i3 { color:var(--mint); }
  .g-intro-disc { font-size:11px; color:var(--honey); line-height:1.6; margin:0 0 16px; }
  .g-intro-disc b { color:#ffe6a3; }
  .gm-row { display:flex; flex-wrap:wrap; gap:6px; justify-content:center; margin:3px 0; }
  .gm-arrow { text-align:center; color:var(--ink-dim); font-size:11px; margin:2px 0; }
  .gm-node { font-size:11px; padding:4px 11px; border-radius:var(--pill); color:#1c2b1f; font-weight:700; }
  .gm-cell { font-size:11px; padding:4px 10px; border-radius:var(--pill); background:var(--surface-2); color:var(--ink-dim); }
  .gm-cell.on { color:#1c2b1f; background:var(--mint); font-weight:700; }
  .gm-cell.done { color:var(--mint); }
  .gm-loop { font-size:12px; color:var(--coral); padding:3px 0; }
  .g-screen { background:radial-gradient(120% 60% at 50% 0%, var(--bg-1) 0%, var(--bg-0) 60%); }
  .g-screen.has-bg { background:var(--bg-0); }
  .g-backdrop { position:absolute; inset:0; z-index:0; overflow:hidden; pointer-events:none; }
  .g-backdrop svg { display:block; width:100%; height:100%; }
  .g-backdrop::after { content:""; position:absolute; inset:0; background:linear-gradient(180deg, rgba(23,20,28,0) 38%, rgba(23,20,28,.6) 100%); }
  .g-screen.has-bg > .g-boss { position:relative; z-index:1; }
  @keyframes gpulse { 0%,100%{opacity:1} 50%{opacity:.5} }
  .g-gauge.over .g-gf, .g-gauge.over .g-gl { animation:gpulse .8s ease-in-out infinite; }
  @keyframes gfade { from{opacity:0} to{opacity:1} }
  @keyframes gpop { from{opacity:0; transform:scale(.92) translateY(6px)} to{opacity:1; transform:none} }
  .g-overlay { animation:gfade .22s ease-out; }
  .g-result, .g-intro { animation:gpop .32s cubic-bezier(.2,.9,.25,1); }
  .g-hand { box-shadow:0 5px 0 rgba(0,0,0,.16),var(--sh-sm); transition:transform .07s,box-shadow .07s; }
  .g-hand:active { transform:translateY(3px); box-shadow:0 2px 0 rgba(0,0,0,.16); }
  .g-bf, .g-gf { transition:width .34s cubic-bezier(.34,1.4,.5,1) !important; }
  @keyframes gflash { 0%{background:rgba(255,255,255,.22)} 100%{background:transparent} }
  .g-bar.flash { animation:gflash .42s ease-out; border-radius:var(--pill); }
  `;
  const style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);
}
