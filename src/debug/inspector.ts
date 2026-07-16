// debug/inspector.ts
// 순수 계측 대시보드. 아트/연출 없음. 오직 "밸런스 감 잡기".
//   - 실시간 숫자 표시 (자원/생산율/활성 modifier/prestige/도감)
//   - 트리거 버튼 (진화/업그레이드/뽑기/환생/부스터/오프라인/세이브/로드/시간스킵)
//   - 그래프 (EP 성장 곡선)

import Decimal from "break_infinity.js";
import type { GameState } from "../engine/state";
import { generatorRate, resourceRate } from "../engine/modifiers";
import { nextCost } from "../engine/actions";
import { computeCost } from "../engine/cost";
import { applyCostModifiers } from "../engine/modifiers";
import * as C from "../content/config";
import { fmt, fmtRate, fmtRemain, fmtDuration } from "./format";

export interface InspectorActions {
  evolve(): void;
  buyUpgrade(id: string): void;
  buyPermanent(id: string): void;
  draw(): void;
  prestige(): void;
  booster(id: string): void;
  offlineAd(): void;
  skip(hours: number): void;
  save(): void;
  load(): void;
  hardReset(): void;
}

export interface InspectorCtx {
  getState(): GameState;
  now(): number;
  actions: InspectorActions;
}

interface Sample {
  t: number;
  ep: Decimal;
}

export function createInspector(root: HTMLElement, ctx: InspectorActions extends never ? never : InspectorCtx) {
  root.innerHTML = SHELL;
  injectStyles();

  const $ = (sel: string) => root.querySelector(sel) as HTMLElement;
  const dash = $("#dash");
  const canvas = $("#epGraph") as unknown as HTMLCanvasElement;
  const skipInput = () => ($("#skipHours") as unknown as HTMLInputElement);

  const history: Sample[] = [];
  const MAX_HISTORY = 600;

  // ── 이벤트 위임 ──────────────────────────────────────────────
  root.addEventListener("click", (e) => {
    const el = (e.target as HTMLElement).closest("[data-action]") as HTMLElement | null;
    if (!el) return;
    const action = el.dataset.action!;
    const id = el.dataset.id;
    const a = ctx.actions;
    switch (action) {
      case "evolve": a.evolve(); break;
      case "buyUpgrade": a.buyUpgrade(id!); break;
      case "buyPermanent": a.buyPermanent(id!); break;
      case "draw": a.draw(); break;
      case "prestige": a.prestige(); break;
      case "booster": a.booster(id!); break;
      case "offlineAd": a.offlineAd(); break;
      case "skip": a.skip(Number(skipInput().value) || 8); break;
      case "save": a.save(); break;
      case "load": a.load(); break;
      case "reset": if (confirm("전체 초기화? (저장 삭제)")) a.hardReset(); break;
    }
    render();
  });

  // ── 렌더 ─────────────────────────────────────────────────────
  function render() {
    const s = ctx.getState();
    const now = ctx.now();

    const ep = s.resources[C.RESOURCE_IDS.EP].amount;
    const epRate = resourceRate(s, C.RESOURCE_IDS.EP, now);
    const genes = s.prestige.genes[C.PRESTIGE_CURRENCY] ?? new Decimal(0);
    const lifeEP = s.lifetime[C.RESOURCE_IDS.EP] ?? new Decimal(0);
    const gen = s.generators[C.MAIN_GENERATOR_ID];
    const prestigeGain = C.PRESTIGE.gainFormula(s);

    dash.innerHTML = [
      section("자원 / 생산", `
        <div class="grid">
          ${stat("EP", fmt(ep))}
          ${stat("EP/s", fmtRate(epRate))}
          ${stat("genes", fmt(genes))}
          ${stat("lifetime EP", fmt(lifeEP))}
          ${stat("이주 횟수", String(s.prestige.migrations))}
        </div>`),

      section("진화 (Generator tier)", `
        <div class="row">
          <span>${gen.id} · tier <b>${gen.tier}/${gen.maxTier}</b> · rate ${fmtRate(generatorRate(s, gen, now))}</span>
        </div>
        <div class="row">
          ${evolveButton(s, now)}
        </div>`),

      section("업그레이드 (EP)", upgradesHtml(s, now)),

      section(`영구 트리 (genes) · 보유 ${fmt(genes)}`, permanentHtml(s, now)),

      section("돌연변이 (가챠) / 도감", mutationHtml(s)),

      section("부스터 / 오프라인 (광고 스텁)", `
        <div class="row wrap">
          ${C.BOOSTERS.map((b) =>
            `<button data-action="booster" data-id="${b.id}">${b.label}</button>`
          ).join("")}
        </div>
        <div class="row wrap">
          <button data-action="offlineAd">오프라인 ×${fmt(C.OFFLINE_AD.grants.value)} 준비 (${C.OFFLINE_AD.durationSec}s)</button>
          <input id="skipHours" type="number" value="8" min="0.1" step="0.1" style="width:64px"/>
          <button data-action="skip">+시간 스킵</button>
          <span class="muted">offline cap ${fmtDuration(C.OFFLINE_CAP_SEC)}</span>
        </div>`),

      section("환생 (프레스티지)", `
        <div class="row">
          <span>다음 환생 획득 genes: <b>${fmt(prestigeGain)}</b> = floor(√(lifetimeEP / 1e6))</span>
        </div>
        <div class="row">
          <button data-action="prestige" ${prestigeGain.gt(0) ? "" : "disabled"}>환생 실행</button>
        </div>`),

      section("세이브 / 로드", `
        <div class="row wrap">
          <button data-action="save">세이브</button>
          <button data-action="load">로드</button>
          <button data-action="reset" class="danger">하드 리셋</button>
        </div>`),

      section("활성 Modifier", modifiersHtml(s, now)),
    ].join("");

    drawGraph();
  }

  function evolveButton(s: GameState, now: number): string {
    const g = s.generators[C.MAIN_GENERATOR_ID];
    if (g.tier >= g.maxTier) return `<button disabled>최대 tier</button>`;
    const raw = computeCost(C.TIER.cost, g.tier);
    const cost = applyCostModifiers(s, C.RESOURCE_IDS.EP, raw, now);
    const afford = s.resources[C.RESOURCE_IDS.EP].amount.gte(cost);
    return `<button data-action="evolve" ${afford ? "" : "disabled"}>진화 → tier ${g.tier + 1} (×${fmt(C.TIER.mult)}) · ${fmt(cost)} EP</button>`;
  }

  function upgradesHtml(s: GameState, now: number): string {
    return `<div class="list">${C.UPGRADES.map((tpl) => {
      // config 의 upgrade 는 정의(템플릿); 현재 level 은 상태에서 별도 추적하지 않고
      // config 객체 자체가 런타임 level 을 들고 있다 (main 이 동일 인스턴스 사용).
      const up = tpl;
      const maxed = up.maxLevel !== undefined && up.level >= up.maxLevel;
      const cost = nextCost(s, up, now);
      const afford = !maxed && s.resources[up.costResource].amount.gte(cost);
      const g = up.grants;
      const eff = `${g.scope}/${g.target} ${g.type}=${fmt(g.value)}`;
      return `<div class="li">
        <span class="li-main">${up.id} <span class="muted">Lv ${up.level}${up.maxLevel ? "/" + up.maxLevel : ""} · ${eff}</span></span>
        <button data-action="buyUpgrade" data-id="${up.id}" ${afford ? "" : "disabled"}>${maxed ? "MAX" : fmt(cost) + " EP"}</button>
      </div>`;
    }).join("")}</div>`;
  }

  function permanentHtml(s: GameState, now: number): string {
    return `<div class="list">${C.PRESTIGE.permanentUpgrades.map((up) => {
      const maxed = up.maxLevel !== undefined && up.level >= up.maxLevel;
      const cost = nextCost(s, up, now);
      const bal = s.prestige.genes[C.PRESTIGE_CURRENCY] ?? new Decimal(0);
      const afford = !maxed && bal.gte(cost);
      const g = up.grants;
      const eff = `${g.scope}/${g.target} ${g.type}=${fmt(g.value)}`;
      return `<div class="li">
        <span class="li-main">${up.id} <span class="muted">Lv ${up.level}${up.maxLevel ? "/" + up.maxLevel : ""} · ${eff}</span></span>
        <button data-action="buyPermanent" data-id="${up.id}" ${afford ? "" : "disabled"}>${maxed ? "MAX" : fmt(cost) + " genes"}</button>
      </div>`;
    }).join("")}</div>`;
  }

  function mutationHtml(s: GameState): string {
    const rarePlus = C.MUTATIONS.filter((m) => m.rarity !== "common");
    const rareCollected = rarePlus.filter((m) => s.collection.has(m.id)).length;
    const setActive = rareCollected >= C.SET_THRESHOLD;
    const grid = C.MUTATIONS.map((m) => {
      const owned = s.collection.has(m.id);
      const count = s.modifiers.filter((x) => x.source === `mutation:${m.id}`).length;
      return `<span class="chip ${owned ? "owned r-" + m.rarity : "locked"}" title="${m.rarity} · w${m.weight} · ${m.grants.scope}/${m.grants.target} ×${fmt(m.grants.value)}">
        ${m.id}${count > 1 ? " ×" + count : ""}</span>`;
    }).join("");
    return `
      <div class="row"><button data-action="draw">돌연변이 뽑기</button>
        <span class="muted">도감 ${s.collection.size}/${C.MUTATIONS.length} · rare+ ${rareCollected}/${C.SET_THRESHOLD}
        · 세트보너스 <b class="${setActive ? "on" : "off"}">${setActive ? "ON ×2 globalRate" : "OFF"}</b></span>
      </div>
      <div class="chips">${grid}</div>`;
  }

  function modifiersHtml(s: GameState, now: number): string {
    if (s.modifiers.length === 0) return `<span class="muted">없음</span>`;
    const rows = s.modifiers
      .slice()
      .sort((a, b) => a.source.localeCompare(b.source))
      .map((m) => {
        const active = (m.expiresAt === undefined || m.expiresAt > now) &&
          (!m.condition || m.condition(s));
        return `<div class="li mono ${active ? "" : "dim"}">
          <span>${m.source}</span>
          <span class="muted">${m.scope}/${m.target ?? "*"} ${m.type}=${fmt(m.value)} · ${fmtRemain(m.expiresAt, now)}${m.condition ? " · cond" : ""}${active ? "" : " · (비활성)"}</span>
        </div>`;
      }).join("");
    return `<div class="list">${rows}</div>`;
  }

  // ── 그래프 ───────────────────────────────────────────────────
  function pushSample() {
    const s = ctx.getState();
    history.push({ t: ctx.now(), ep: s.resources[C.RESOURCE_IDS.EP].amount });
    if (history.length > MAX_HISTORY) history.shift();
  }

  function log10(d: Decimal): number {
    if (d.lte(0)) return 0;
    // break_infinity: log10 근사 = exponent + log10(mantissa)
    return d.exponent + Math.log10(d.mantissa);
  }

  function drawGraph() {
    const cx = canvas.getContext("2d");
    if (!cx) return;
    const w = canvas.width;
    const h = canvas.height;
    cx.clearRect(0, 0, w, h);
    cx.fillStyle = "#0a0a0a";
    cx.fillRect(0, 0, w, h);

    if (history.length < 2) return;
    const t0 = history[0].t;
    const t1 = history[history.length - 1].t;
    const dt = Math.max(1, t1 - t0);

    const vals = history.map((s) => log10(s.ep));
    const vmin = Math.min(...vals, 0);
    const vmax = Math.max(...vals, 1);
    const vspan = Math.max(1, vmax - vmin);

    // 그리드
    cx.strokeStyle = "#222";
    cx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = (h * i) / 4;
      cx.beginPath();
      cx.moveTo(0, y);
      cx.lineTo(w, y);
      cx.stroke();
    }

    // 곡선 (log10 EP)
    cx.strokeStyle = "#4ade80";
    cx.lineWidth = 2;
    cx.beginPath();
    history.forEach((s, i) => {
      const x = (w * (s.t - t0)) / dt;
      const y = h - (h * (vals[i] - vmin)) / vspan;
      if (i === 0) cx.moveTo(x, y);
      else cx.lineTo(x, y);
    });
    cx.stroke();

    cx.fillStyle = "#4ade80";
    cx.font = "11px monospace";
    cx.fillText(`log10(EP): ${vmin.toFixed(1)} → ${vmax.toFixed(1)}`, 6, 14);
  }

  return {
    render,
    tickGraph: pushSample,
  };
}

// ── HTML/CSS 헬퍼 ────────────────────────────────────────────
function section(title: string, body: string): string {
  return `<section class="card"><h3>${title}</h3>${body}</section>`;
}
function stat(label: string, value: string): string {
  return `<div class="stat"><div class="lbl">${label}</div><div class="val">${value}</div></div>`;
}

const SHELL = `
  <header class="topbar">
    <h1>Idle Growth Engine — Debug Inspector</h1>
    <span class="muted">순수 계측 화면 (스토리·아트 없음)</span>
  </header>
  <canvas id="epGraph" width="920" height="160"></canvas>
  <div id="dash"></div>
`;

let stylesInjected = false;
function injectStyles() {
  if (stylesInjected) return;
  stylesInjected = true;
  const css = `
  :root { color-scheme: dark; }
  body { margin:0; background:#0d0d0f; color:#e5e5e5; font-family: ui-monospace, monospace; }
  .topbar { display:flex; align-items:baseline; gap:12px; padding:10px 14px; border-bottom:1px solid #222; }
  .topbar h1 { font-size:15px; margin:0; }
  #epGraph { display:block; width:100%; max-width:960px; margin:10px auto; border:1px solid #222; background:#0a0a0a; }
  #dash { display:grid; grid-template-columns: repeat(auto-fill,minmax(320px,1fr)); gap:10px; padding:0 14px 40px; max-width:1200px; margin:0 auto; }
  .card { border:1px solid #262626; border-radius:6px; padding:10px 12px; background:#141416; }
  .card h3 { margin:0 0 8px; font-size:13px; color:#a3a3a3; font-weight:600; }
  .grid { display:grid; grid-template-columns: repeat(auto-fill,minmax(110px,1fr)); gap:8px; }
  .stat { background:#0f0f11; border:1px solid #222; border-radius:4px; padding:6px 8px; }
  .stat .lbl { font-size:10px; color:#777; }
  .stat .val { font-size:15px; color:#f5f5f5; }
  .row { margin:6px 0; display:flex; align-items:center; gap:8px; }
  .row.wrap, .wrap { flex-wrap:wrap; }
  .list { display:flex; flex-direction:column; gap:4px; }
  .li { display:flex; justify-content:space-between; align-items:center; gap:8px; padding:3px 4px; border-bottom:1px solid #1c1c1c; }
  .li-main { font-size:12px; }
  .li.dim { opacity:.4; }
  .mono { font-size:11px; }
  .muted { color:#777; font-size:11px; }
  button { background:#1f2937; color:#e5e5e5; border:1px solid #374151; border-radius:4px; padding:5px 9px; font:inherit; font-size:12px; cursor:pointer; }
  button:hover:not(:disabled) { background:#374151; }
  button:disabled { opacity:.35; cursor:not-allowed; }
  button.danger { background:#3f1d1d; border-color:#742a2a; }
  input { background:#0f0f11; color:#e5e5e5; border:1px solid #333; border-radius:4px; padding:4px; font:inherit; }
  .chips { display:flex; flex-wrap:wrap; gap:4px; margin-top:6px; }
  .chip { font-size:10px; padding:2px 6px; border-radius:10px; border:1px solid #333; }
  .chip.locked { color:#555; border-color:#222; }
  .chip.owned { color:#111; font-weight:600; }
  .chip.r-common { background:#9ca3af; }
  .chip.r-rare { background:#60a5fa; }
  .chip.r-epic { background:#c084fc; }
  .chip.r-legendary { background:#fbbf24; }
  b.on { color:#4ade80; } b.off { color:#666; }
  `;
  const style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);
}
