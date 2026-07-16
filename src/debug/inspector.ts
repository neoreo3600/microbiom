// debug/inspector.ts
// 순수 계측 대시보드 (아트 없음). 《속나라》 P0: 미터4·염증·해독·뿌리노드 실시간값 +
// [순환][정화][재생] 손길 + 보스전 + [이주][+시간][세이브/로드] + 난이도 그래프 + 만류귀종 트리.

import Decimal from "break_infinity.js";
import {
  clampMeter,
  meterAverage,
  type GameState,
  type MeterKey,
} from "../engine/state";
import { generatorRate, resourceRate, applyCostModifiers } from "../engine/modifiers";
import { nextCost } from "../engine/actions";
import { computeCost } from "../engine/cost";
import { downstreamDifficulty } from "../engine/rootnode";
import { evalGate, victoryMet } from "../engine/boss";
import * as C from "../content/config";
import { BOSSES, CHAIN_TREE, FEEDBACK_LOOPS } from "../content/bosses";
import { HOSTS } from "../content/campaign";
import { fmt, fmtRate, fmtRemain, fmtDuration } from "./format";

export interface InspectorActions {
  // 성장엔진
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
  // 보스전 & 순·정·재
  startBoss(id: string): void;
  leaveBoss(): void;
  circulate(): void;
  purify(): void;
  regenerate(): void;
  attack(): void;
  migrate(): void;
}

export interface InspectorCtx {
  getState(): GameState;
  now(): number;
  actions: InspectorActions;
}

// 미터 표면 이름·색
const METER_META: Record<MeterKey, { label: string; color: string }> = {
  gut: { label: "숲(腸)", color: "#4ade80" },
  water: { label: "물길(水)", color: "#38bdf8" },
  warmth: { label: "온기(熱)", color: "#fb923c" },
  mind: { label: "빛(識)", color: "#c084fc" },
};
const PHASE_LABEL: Record<string, string> = {
  circulation: "순환",
  purification: "정화",
  regeneration: "재생",
  won: "승리(항상성 복원)",
};

interface Sample {
  t: number;
  meterAvg: number;
  inflammation: number;
}

export function createInspector(root: HTMLElement, ctx: InspectorCtx) {
  root.innerHTML = SHELL;
  injectStyles();

  const $ = (sel: string) => root.querySelector(sel) as HTMLElement;
  const dash = $("#dash");
  const canvas = $("#graph") as unknown as HTMLCanvasElement;
  const skipInput = () => ($("#skipHours") as unknown as HTMLInputElement);

  const history: Sample[] = [];
  const MAX_HISTORY = 600;

  root.addEventListener("click", (e) => {
    const el = (e.target as HTMLElement).closest("[data-action]") as HTMLElement | null;
    if (!el) return;
    const a = ctx.actions;
    const id = el.dataset.id;
    switch (el.dataset.action) {
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
      case "startBoss": a.startBoss(id!); break;
      case "leaveBoss": a.leaveBoss(); break;
      case "circulate": a.circulate(); break;
      case "purify": a.purify(); break;
      case "regenerate": a.regenerate(); break;
      case "attack": a.attack(); break;
      case "migrate": a.migrate(); break;
    }
    render();
  });

  function meterCtx(s: GameState): Record<string, number> {
    return {
      gut: s.meters.gut, water: s.meters.water, warmth: s.meters.warmth, mind: s.meters.mind,
      inflammation: s.inflammation, detox: s.detox,
      gauge: s.encounter?.gauge ?? 0, diversity: s.rootnode.diversity,
    };
  }

  function render() {
    const s = ctx.getState();
    const now = ctx.now();
    const ep = s.resources[C.RESOURCE_IDS.EP].amount;
    const epRate = resourceRate(s, C.RESOURCE_IDS.EP, now);
    const genes = s.prestige.genes[C.PRESTIGE_CURRENCY] ?? new Decimal(0);

    dash.innerHTML = [
      ecosystemPanel(s, ep, epRate, genes),
      rootnodePanel(s),
      bossPanel(s),
      growthPanel(s, now),
      boosterOfflinePanel(),
      prestigeSavePanel(s, genes),
      chainTreePanel(),
      modifiersPanel(s, now),
    ].join("");

    drawGraph();
  }

  // ── 생태계 (미터4 + 염증 + 해독) ──
  function ecosystemPanel(s: GameState, ep: Decimal, epRate: Decimal, genes: Decimal): string {
    const meterBars = (Object.keys(METER_META) as MeterKey[])
      .map((k) => bar(METER_META[k].label, s.meters[k], METER_META[k].color)).join("");
    return section("생태계 — 장수온심 (숲·물길·온기·빛)", `
      ${meterBars}
      ${bar("염증(오염)", s.inflammation, "#ef4444")}
      ${bar("해독 부담", s.detox, "#f59e0b")}
      <div class="grid" style="margin-top:8px">
        ${stat("EP", fmt(ep))}
        ${stat("EP/s", fmtRate(epRate))}
        ${stat("genes", fmt(genes))}
        ${stat("이주 횟수", String(s.prestige.migrations))}
        ${stat("미터 평균", meterAverage(s).toFixed(3))}
      </div>`);
  }

  // ── 뿌리노드 (마이크로바이옴) ──
  function rootnodePanel(s: GameState): string {
    const o = s.rootnode.outputs;
    return section("뿌리노드 · 마이크로바이옴 (만류의 宗)", `
      ${bar("다양성(내구도=방어력)", s.rootnode.diversity, "#22d3ee")}
      <div class="sub">전 월드 배급 4출력</div>
      ${bar("면역력", o.immune, "#60a5fa")}
      ${bar("신경전달", o.neuro, "#c084fc")}
      ${bar("SCFA", o.scfa, "#4ade80")}
      ${bar("해독·염증방어", o.detox, "#f59e0b")}
      <div class="row"><span class="muted">하류 난이도 계수: <b>${downstreamDifficulty(s).toFixed(2)}</b> (다양성↑ → 하류 약해짐 = 만류귀종)</span></div>`);
  }

  // ── 보스전 ──
  function bossPanel(s: GameState): string {
    const host = HOSTS[s.campaign.hostIndex];
    const progress = `숙주 ${s.campaign.hostIndex + 1}/${HOSTS.length}`;
    const hostCard = host
      ? `<div class="host"><b>${host.name}</b> (${host.age}) · <span class="muted">${progress}</span><div class="muted">${host.bio}</div></div>`
      : "";

    const picker = BOSSES.map((b) =>
      `<button data-action="startBoss" data-id="${b.id}">${b.disease} 시작(debug)</button>`
    ).join("");

    if (!s.encounter) {
      return section("보스전 (질병)", `
        ${hostCard}
        <div class="row wrap">${picker}</div>
        <div class="muted">보스를 시작하면 그 질병의 미터 벡터로 상태가 세팅됩니다. (뿌리노드가 튼튼할수록 덜 무너진 채 시작 — 만류귀종)</div>`);
    }

    const e = s.encounter;
    const cx = meterCtx(s);
    const gateRow = (label: string, expr: string, done: boolean) =>
      `<div class="gate ${done ? "on" : ""}">${done ? "✓" : "·"} <b>${label}</b> <span class="muted">${expr || "—"}</span></div>`;
    const won = e.phase === "won";
    const gaugeOver = e.gauge > 1;

    const nextHost = HOSTS[s.campaign.hostIndex + 1];
    const winBlock = won
      ? `<div class="win">🟢 항상성 복원 — ${host ? host.name : ""}: "${host?.recoveryCut ?? ""}"
           <div class="muted">재발저항 ${e.relapseResist.toFixed(2)} (뿌리 다양성 계승)</div>
           ${nextHost
             ? `<button data-action="migrate">이주 → ${nextHost.name} (${nextHost.boss.disease})</button>`
             : `<span class="muted">모든 숙주 완료 — 캠페인 클리어</span>`}
         </div>`
      : "";

    return section(`보스전 — ${e.disease} <span class="muted">[${e.world}] 감정:${e.emotion}</span>`, `
      ${hostCard}
      <div class="row wrap">
        <span class="phase">${PHASE_LABEL[e.phase]}</span>
        ${e.paradox ? `<span class="paradox">역설: ${e.paradox}</span>` : ""}
        <button data-action="leaveBoss">이탈</button>
      </div>
      ${bar(`${e.gaugeLabel} (${e.gaugeBehavior})${gaugeOver ? " ⚠OVERFLOW" : ""}`, Math.min(1, e.gauge), gaugeOver ? "#ef4444" : "#eab308")}
      <div class="gates">
        ${gateRow("순환", e.gates.circulation, evalGate(e.gates.circulation, cx))}
        ${gateRow("정화", e.gates.purification, evalGate(e.gates.purification, cx))}
        ${gateRow("재생·승리", e.gates.regeneration, victoryMet(s))}
      </div>
      <div class="sub">순·정·재 손길 (heatPolarity ${e.heatPolarity > 0 ? "+1 보(온기↑)" : "-1 사·淸熱(온기↓)"})</div>
      <div class="row wrap">
        <button data-action="circulate">순환 (물길·온기)</button>
        <button data-action="purify">정화 (염증·게이지·해독↓)</button>
        <button data-action="regenerate">재생 (숲·빛·뿌리)</button>
        <button data-action="attack" class="${e.attackRaisesGauge > 0 ? "danger" : ""}">공격/딜${e.attackRaisesGauge > 0 ? " ⚠자해" : ""}</button>
      </div>
      ${winBlock}`);
  }

  // ── 성장엔진 (생산: 진화/업그레이드/뽑기/genes 트리) ──
  function growthPanel(s: GameState, now: number): string {
    const g = s.generators[C.MAIN_GENERATOR_ID];
    const evoCost = applyCostModifiers(s, C.RESOURCE_IDS.EP, computeCost(C.TIER.cost, g.tier), now);
    const canEvo = g.tier < g.maxTier && s.resources[C.RESOURCE_IDS.EP].amount.gte(evoCost);
    const ups = C.UPGRADES.map((up) => {
      const maxed = up.maxLevel !== undefined && up.level >= up.maxLevel;
      const cost = nextCost(s, up, now);
      const afford = !maxed && s.resources[up.costResource].amount.gte(cost);
      return `<button data-action="buyUpgrade" data-id="${up.id}" ${afford ? "" : "disabled"}>${up.id} Lv${up.level} · ${maxed ? "MAX" : fmt(cost)}</button>`;
    }).join("");
    const perms = C.PRESTIGE.permanentUpgrades.map((up) => {
      const maxed = up.maxLevel !== undefined && up.level >= up.maxLevel;
      const cost = nextCost(s, up, now);
      const bal = s.prestige.genes[C.PRESTIGE_CURRENCY] ?? new Decimal(0);
      const afford = !maxed && bal.gte(cost);
      return `<button data-action="buyPermanent" data-id="${up.id}" ${afford ? "" : "disabled"}>${up.id} Lv${up.level} · ${maxed ? "MAX" : fmt(cost) + "g"}</button>`;
    }).join("");
    const rareCollected = C.MUTATIONS.filter((m) => m.rarity !== "common" && s.collection.has(m.id)).length;
    return section("성장엔진 (생산)", `
      <div class="row"><span>${g.id} tier <b>${g.tier}/${g.maxTier}</b> · ${fmtRate(generatorRate(s, g, now))}</span></div>
      <div class="row wrap">
        <button data-action="evolve" ${canEvo ? "" : "disabled"}>진화→t${g.tier + 1} (×${fmt(C.TIER.mult)}) · ${fmt(evoCost)}</button>
      </div>
      <div class="sub">업그레이드 (EP)</div><div class="row wrap">${ups}</div>
      <div class="sub">영구 트리 (genes)</div><div class="row wrap">${perms}</div>
      <div class="sub">유익균 뽑기 · 도감 ${s.collection.size} (rare+ ${rareCollected}/${C.SET_THRESHOLD})</div>
      <div class="row wrap"><button data-action="draw">유익균/돌연변이 뽑기</button></div>`);
  }

  function boosterOfflinePanel(): string {
    return section("부스터 / 오프라인 (광고 스텁)", `
      <div class="row wrap">
        ${C.BOOSTERS.map((b) => `<button data-action="booster" data-id="${b.id}">${b.label}</button>`).join("")}
      </div>
      <div class="row wrap">
        <button data-action="offlineAd">오프라인 ×${fmt(C.OFFLINE_AD.grants.value)} 준비 (${C.OFFLINE_AD.durationSec}s)</button>
        <input id="skipHours" type="number" value="8" min="0.1" step="0.1" style="width:60px"/>
        <button data-action="skip">+시간 스킵</button>
        <span class="muted">cap ${fmtDuration(C.OFFLINE_CAP_SEC)}</span>
      </div>`);
  }

  function prestigeSavePanel(s: GameState, genes: Decimal): string {
    const gain = C.PRESTIGE.gainFormula(s);
    const won = s.encounter?.phase === "won";
    const nextHost = HOSTS[s.campaign.hostIndex + 1];
    const migrateHint = won
      ? (nextHost ? `클리어! 이주 시 <b>${fmt(gain)}</b> genes 계승 → ${nextHost.name}` : "모든 숙주 완료")
      : `이주는 <b>현재 숙주 항상성 복원(승리)</b> 후 가능 · 계승 예정 genes ${fmt(gain)}`;
    return section("이주 (프레스티지) / 세이브", `
      <div class="row"><span class="muted">${migrateHint}</span></div>
      <div class="row wrap">
        <button data-action="migrate" ${won && nextHost ? "" : "disabled"}>이주 → 다음 숙주</button>
        <button data-action="save">세이브</button>
        <button data-action="load">로드</button>
        <button data-action="reset" class="danger">하드 리셋</button>
      </div>
      <div class="muted">이주 = 지혜(genes·도감) 계승 + 몸(EP·생산·뿌리노드) 리셋. 이주 ${s.prestige.migrations}회</div>`);
  }

  function chainTreePanel(): string {
    const branches = CHAIN_TREE.branches
      .map((b) => `<div class="chain"><b>${b.gate}</b> → ${b.diseases.join(", ")}</div>`).join("");
    return section("만류귀종 트리 (연쇄·되먹임)", `
      <div class="chain root">${CHAIN_TREE.root} (뿌리) ↓</div>
      ${branches}
      <div class="sub">되먹임 고리</div>
      ${FEEDBACK_LOOPS.map((l) => `<div class="muted">🔁 ${l}</div>`).join("")}`);
  }

  function modifiersPanel(s: GameState, now: number): string {
    if (s.modifiers.length === 0) return section("활성 Modifier", `<span class="muted">없음</span>`);
    const rows = s.modifiers.slice().sort((a, b) => a.source.localeCompare(b.source)).map((m) => {
      const active = (m.expiresAt === undefined || m.expiresAt > now) && (!m.condition || m.condition(s));
      return `<div class="li mono ${active ? "" : "dim"}"><span>${m.source}</span>
        <span class="muted">${m.scope}/${m.target ?? "*"} ${m.type}=${fmt(m.value)} · ${fmtRemain(m.expiresAt, now)}${m.condition ? " cond" : ""}</span></div>`;
    }).join("");
    return section("활성 Modifier", `<div class="list">${rows}</div>`);
  }

  // ── 그래프: 미터 평균(초록) + 염증(빨강) ──
  function pushSample() {
    const s = ctx.getState();
    history.push({ t: ctx.now(), meterAvg: meterAverage(s), inflammation: s.inflammation });
    if (history.length > MAX_HISTORY) history.shift();
  }

  function drawGraph() {
    const cx = canvas.getContext("2d");
    if (!cx) return;
    const w = canvas.width, h = canvas.height;
    cx.fillStyle = "#0a0a0a";
    cx.fillRect(0, 0, w, h);
    cx.strokeStyle = "#222";
    for (let i = 0; i <= 4; i++) { const y = (h * i) / 4; cx.beginPath(); cx.moveTo(0, y); cx.lineTo(w, y); cx.stroke(); }
    if (history.length < 2) return;
    const t0 = history[0].t, t1 = history[history.length - 1].t, dt = Math.max(1, t1 - t0);
    const line = (key: "meterAvg" | "inflammation", color: string) => {
      cx.strokeStyle = color; cx.lineWidth = 2; cx.beginPath();
      history.forEach((sm, i) => {
        const x = (w * (sm.t - t0)) / dt;
        const y = h - h * clampMeter(sm[key]);
        i === 0 ? cx.moveTo(x, y) : cx.lineTo(x, y);
      });
      cx.stroke();
    };
    line("meterAvg", "#4ade80");
    line("inflammation", "#ef4444");
    cx.fillStyle = "#4ade80"; cx.font = "11px monospace"; cx.fillText("미터 평균", 6, 14);
    cx.fillStyle = "#ef4444"; cx.fillText("염증", 78, 14);
  }

  return { render, tickGraph: pushSample };
}

// ── HTML/CSS 헬퍼 ──
function section(title: string, body: string): string {
  return `<section class="card"><h3>${title}</h3>${body}</section>`;
}
function stat(label: string, value: string): string {
  return `<div class="stat"><div class="lbl">${label}</div><div class="val">${value}</div></div>`;
}
function bar(label: string, v01: number, color: string): string {
  const pct = (clampMeter(v01) * 100).toFixed(0);
  return `<div class="bar"><span class="bl">${label}</span><div class="bt"><div class="bf" style="width:${pct}%;background:${color}"></div></div><span class="bv">${v01.toFixed(2)}</span></div>`;
}

const SHELL = `
  <header class="topbar">
    <h1>속나라 — Debug Inspector (P0)</h1>
    <span class="muted">순수 계측 · 의학적 조언 아님 · 몸속 생태계 체험</span>
  </header>
  <canvas id="graph" width="920" height="140"></canvas>
  <div id="dash"></div>
`;

let stylesInjected = false;
function injectStyles() {
  if (stylesInjected) return;
  stylesInjected = true;
  const css = `
  :root { color-scheme: dark; }
  body { margin:0; background:#0d0d0f; color:#e5e5e5; font-family: ui-monospace, monospace; }
  .topbar { display:flex; align-items:baseline; gap:12px; padding:10px 14px; border-bottom:1px solid #222; flex-wrap:wrap; }
  .topbar h1 { font-size:15px; margin:0; }
  #graph { display:block; width:100%; max-width:960px; margin:10px auto; border:1px solid #222; background:#0a0a0a; }
  #dash { display:grid; grid-template-columns: repeat(auto-fill,minmax(340px,1fr)); gap:10px; padding:0 14px 40px; max-width:1280px; margin:0 auto; }
  .card { border:1px solid #262626; border-radius:6px; padding:10px 12px; background:#141416; }
  .card h3 { margin:0 0 8px; font-size:13px; color:#cbd5e1; font-weight:600; }
  .grid { display:grid; grid-template-columns: repeat(auto-fill,minmax(96px,1fr)); gap:8px; }
  .stat { background:#0f0f11; border:1px solid #222; border-radius:4px; padding:6px 8px; }
  .stat .lbl { font-size:10px; color:#777; }
  .stat .val { font-size:14px; color:#f5f5f5; }
  .bar { display:flex; align-items:center; gap:8px; margin:3px 0; }
  .bar .bl { width:120px; font-size:11px; color:#cbd5e1; }
  .bar .bt { flex:1; height:12px; background:#0f0f11; border:1px solid #222; border-radius:6px; overflow:hidden; }
  .bar .bf { height:100%; transition:width .15s; }
  .bar .bv { width:36px; text-align:right; font-size:11px; color:#aaa; }
  .sub { font-size:11px; color:#888; margin:8px 0 3px; border-top:1px solid #1c1c1c; padding-top:5px; }
  .row { margin:5px 0; display:flex; align-items:center; gap:8px; }
  .row.wrap, .wrap { flex-wrap:wrap; }
  .list { display:flex; flex-direction:column; gap:3px; }
  .li { display:flex; justify-content:space-between; gap:8px; padding:2px 4px; border-bottom:1px solid #1c1c1c; }
  .li.dim { opacity:.4; } .mono { font-size:11px; }
  .muted { color:#777; font-size:11px; }
  button { background:#1f2937; color:#e5e5e5; border:1px solid #374151; border-radius:4px; padding:5px 9px; font:inherit; font-size:12px; cursor:pointer; }
  button:hover:not(:disabled) { background:#374151; }
  button:disabled { opacity:.35; cursor:not-allowed; }
  button.danger { background:#3f1d1d; border-color:#742a2a; }
  input { background:#0f0f11; color:#e5e5e5; border:1px solid #333; border-radius:4px; padding:4px; font:inherit; }
  .phase { background:#1e3a8a; color:#dbeafe; padding:2px 8px; border-radius:10px; font-size:12px; }
  .paradox { color:#fca5a5; font-size:11px; }
  .gates { margin:6px 0; }
  .gate { font-size:11px; padding:2px 0; color:#888; }
  .gate.on { color:#4ade80; }
  .win { margin-top:8px; color:#4ade80; font-weight:600; }
  .win button { margin-top:6px; background:#14532d; border-color:#166534; color:#dcfce7; }
  .host { background:#0f0f11; border:1px solid #222; border-radius:4px; padding:6px 8px; margin-bottom:6px; font-size:12px; }
  .host b { color:#f5f5f5; }
  .chain { font-size:11px; padding:2px 0; color:#cbd5e1; }
  .chain.root { color:#22d3ee; font-weight:600; }
  `;
  const style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);
}
