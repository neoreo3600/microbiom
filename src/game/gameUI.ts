// game/gameUI.ts
// 플레이어용 게임 화면 (모바일 세로 HUD). 디버그 인스펙터와 같은 엔진/액션을 소비한다.
// 슬라이스 1: 보스전 핵심 루프 — 숙주 헤더 · 페이즈 스테퍼 · 미터/게이지 · 순·정·재 손길 · 승리 오버레이.

import {
  clampMeter,
  type GameState,
  type MeterKey,
} from "../engine/state";
import { mindFoundationMet, feedbackLoops } from "../engine/meters";
import { genesGain } from "../content/config";
import { HOSTS } from "../content/campaign";
import { BOSSES } from "../content/bosses";
import { worldById, ELEMENT_LABEL, tasteLabel, TASTE_EFFECT_DESC } from "../content/worlds";
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

  root.addEventListener("click", (e) => {
    const el = (e.target as HTMLElement).closest("[data-action]") as HTMLElement | null;
    if (!el) return;
    const a = ctx.actions as InspectorActions;
    const id = el.dataset.id;
    switch (el.dataset.action) {
      case "circulate": a.circulate(); break;
      case "purify": a.purify(); break;
      case "regenerate": a.regenerate(); break;
      case "attack": a.attack(); break;
      case "crisis": a.crisis(); break;
      case "meditation": a.meditation(); break;
      case "drawHero": a.drawHero(); break;
      case "useTaste": a.useTaste(); break;
      case "migrate": a.migrate(); break;
      case "startBoss": a.startBoss(id!); break;
    }
    render();
  });

  function bar(label: string, v01: number, color: string, danger = false): string {
    const pct = (clampMeter(v01) * 100).toFixed(0);
    return `<div class="g-bar ${danger ? "danger" : ""}">
      <span class="g-bl">${label}</span>
      <div class="g-bt"><div class="g-bf" style="width:${pct}%;background:${color}"></div></div>
      <span class="g-bv">${v01.toFixed(2)}</span></div>`;
  }

  function render() {
    const s = ctx.getState();
    const host = HOSTS[s.campaign.hostIndex];
    const e = s.encounter;

    if (!e) {
      root.innerHTML = `<div class="g-screen">
        <div class="g-empty">
          <div class="g-title">속나라</div>
          <div class="g-sub">돌볼 속나라가 없습니다.</div>
          ${host ? `<button class="g-primary" data-action="startBoss" data-id="${host.boss.id}">${host.name}의 속나라로 들어가기</button>` : ""}
        </div></div>`;
      return;
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

    // 미터
    const meters = (Object.keys(METER_META) as MeterKey[])
      .map((k) => bar(METER_META[k].label, s.meters[k], METER_META[k].color)).join("");

    // 상태 배지 (식 잠금 / 감시)
    let statusLine = "";
    if (e.mindLock) {
      const open = mindFoundationMet(s, e.mindLock);
      statusLine += `<div class="g-status ${open ? "ok" : "warn"}">${open ? "빛(識) 잠금 해제됨 — 이제 마음이 열린다" : "🔒 몸(장·물·온기)을 먼저 회복해야 마음이 열립니다"}</div>`;
    }
    if (e.gaugeBehavior === "stealthGrow") {
      const watched = s.meters.water >= 0.6;
      statusLine += `<div class="g-status ${watched ? "ok" : "warn"}">${watched ? "👁 감시망 가동 — 연료를 끊어 억제하세요" : "🫥 종양 은신 중 — 물길(감시)을 올리세요"}</div>`;
    }

    // 오미
    const amt = tasteAmount(s, e.taste);
    const tasteRow = `<div class="g-taste">
      <span>오미 ${tasteLabel(e.taste)} <b>${amt.toFixed(1)}</b> · ${TASTE_EFFECT_DESC[e.taste] ?? ""}</span>
      <button class="g-mini" data-action="useTaste" ${amt >= TASTE_COST ? "" : "disabled"}>오미 사용</button></div>`;

    // 되먹임 (활성 고리만 경고)
    const active = feedbackLoops(s).filter((l) => l.active);
    const loopWarn = active.length
      ? `<div class="g-loops">🔴 악순환: ${active.map((l) => l.id).join(", ")} — 정화·재생으로 끊으세요</div>`
      : "";

    // 민감 배너
    const banner = e.sensitive
      ? `<div class="g-disclaimer">은유적 체험이며 의학적 조언이 아닙니다. ${e.disease}은(는) 전문적인 진단·치료가 필요합니다.</div>`
      : "";

    // 승리 오버레이
    const overlay = won ? winOverlay(s, host) : "";

    root.innerHTML = `<div class="g-screen">
      ${banner}
      <div class="g-host">
        <div><b>${host ? host.name : ""}</b> ${host ? `(${host.age})` : ""} <span class="g-muted">· 숙주 ${s.campaign.hostIndex + 1}/${HOSTS.length}</span></div>
        <div class="g-muted">${e.disease} · ${worldStr}${host ? ` · "${host.bio}"` : ""}</div>
      </div>

      <div class="g-stepper">${stepper}</div>

      <div class="g-gauge ${gaugeOver ? "over" : ""}">
        <div class="g-gl">${e.gaugeLabel}${gaugeOver ? " ⚠ 넘침!" : ""}</div>
        <div class="g-gt"><div class="g-gf" style="width:${(Math.min(1, e.gauge) * 100).toFixed(0)}%"></div></div>
      </div>

      <div class="g-meters">${meters}${bar("염증", s.inflammation, "#ef4444", true)}</div>
      ${statusLine}
      ${loopWarn}

      <div class="g-hands">
        <button class="g-hand h-water" data-action="circulate"><span>순환</span><small>물길·온기 열기</small></button>
        <button class="g-hand h-purify" data-action="purify"><span>정화</span><small>염증·게이지 비우기</small></button>
        <button class="g-hand h-regen" data-action="regenerate"><span>재생</span><small>숲·빛·뿌리 키우기</small></button>
      </div>
      <div class="g-secondary">
        <button class="g-mini ${e.attackRaisesGauge > 0 ? "danger" : ""}" data-action="attack">공격/딜${e.attackRaisesGauge > 0 ? " ⚠자해" : ""}</button>
        <button class="g-mini ad" data-action="crisis">🎬 위기지원</button>
        <button class="g-mini ad" data-action="meditation">🎬 명상</button>
        <button class="g-mini ad" data-action="drawHero">🎬 뽑기</button>
      </div>
      ${tasteRow}

      ${overlay}
    </div>`;
  }

  function winOverlay(s: GameState, host: (typeof HOSTS)[number] | undefined): string {
    const e = s.encounter!;
    const nextHost = HOSTS[s.campaign.hostIndex + 1];
    const gain = genesGain(s);
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
  .g-root { max-width:480px; margin:0 auto; }
  .g-screen { padding:12px 14px 28px; position:relative; min-height:100vh; box-sizing:border-box; }
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
  `;
  const style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);
}
