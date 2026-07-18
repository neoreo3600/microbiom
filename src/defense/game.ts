// defense/game.ts
// 《내몸을 지켜라》 컨트롤러: 캔버스 렌더 + 입력(놓기/드래그/합체) + HUD + RAF 루프.
// 사운드/이펙트는 game/juice.ts 재활용.

import {
  COLS, ROWS, createDefenseState, startGame, step, placeCell, placeWall,
  cellAt, dropCell, type DefenseState, type Cell,
} from "./engine";
import { DEFENSE_CONFIG } from "./content";
import { sfx, floatText, burst, confetti } from "../game/juice";

const ENEMY_NAME: Record<string, string> = { badbac: "유해균", inflam: "염증세포", boss_cancer: "암세포" };

export function createDefenseGame(root: HTMLElement) {
  injectCss();
  root.classList.add("d-root");
  root.innerHTML = `
    <div class="d-top">
      <div>웨이브 <b id="d-wave">–</b></div>
      <div class="d-core">🛡 거점<div class="d-bar"><div id="d-coref" class="d-coref"></div></div></div>
    </div>
    <div class="d-energy">⚡<b id="d-energy">0</b><div class="d-bar wide"><div id="d-ef" class="d-ef"></div></div></div>
    <div class="d-arena"><canvas id="d-canvas"></canvas><div id="d-overlay" class="d-overlay"></div></div>
    <div class="d-controls">
      <button class="d-btn on" data-mode="cell">🦠 호중구 <small>${DEFENSE_CONFIG.t1Cost}</small></button>
      <button class="d-btn" data-mode="wall">🧱 성벽 <small>${DEFENSE_CONFIG.wallCost}</small></button>
      <button class="d-btn ghost" data-act="restart">↻ 다시</button>
    </div>`;

  const canvas = root.querySelector("#d-canvas") as HTMLCanvasElement;
  const ctx = canvas.getContext("2d")!;
  const overlay = root.querySelector("#d-overlay") as HTMLElement;
  const el = {
    wave: root.querySelector("#d-wave") as HTMLElement,
    energy: root.querySelector("#d-energy") as HTMLElement,
    coref: root.querySelector("#d-coref") as HTMLElement,
    ef: root.querySelector("#d-ef") as HTMLElement,
  };

  let state = createDefenseState(DEFENSE_CONFIG);
  let mode: "cell" | "wall" = "cell";
  let running = false;
  let last = 0;
  // 레이아웃(픽셀)
  let W = 0, H = 0, colW = 0, rowH = 0, padTop = 0, coreH = 0, r = 0;

  function layout() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cssW = Math.min(root.clientWidth || 420, 480);
    const cssH = Math.max(360, Math.min(window.innerHeight - 210, Math.round(cssW * 1.5)));
    canvas.style.width = cssW + "px";
    canvas.style.height = cssH + "px";
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    W = cssW; H = cssH;
    colW = W / COLS;
    padTop = 8; coreH = 30;
    rowH = (H - padTop - coreH) / (ROWS + 1);
    r = Math.min(colW, rowH) * 0.36;
  }
  const px = (col: number) => col * colW + colW / 2;
  const py = (y: number) => padTop + (y + 1) * rowH;
  const slotOf = (mx: number, my: number) => ({
    col: Math.max(0, Math.min(COLS - 1, Math.floor(mx / colW))),
    row: Math.max(0, Math.min(ROWS - 1, Math.round((my - padTop) / rowH - 1))),
  });

  // ── 입력 ──
  let drag: { cell: Cell; x: number; y: number; moved: boolean } | null = null;
  function localXY(e: PointerEvent) {
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }
  canvas.addEventListener("pointerdown", (e) => {
    if (state.status === "ready") { startGame(state); sfx.phase(); return; }
    if (state.status !== "playing") return;
    const { x, y } = localXY(e);
    const { col, row } = slotOf(x, y);
    const hit = cellAt(state, col, row);
    if (hit) { drag = { cell: hit, x, y, moved: false }; canvas.setPointerCapture(e.pointerId); return; }
    // 빈 슬롯 탭 = 놓기
    const ok = mode === "wall" ? placeWall(state, col, row) : placeCell(state, col, row);
    if (ok) sfx.circulate();
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const { x, y } = localXY(e);
    if (Math.abs(x - drag.x) + Math.abs(y - drag.y) > 6) drag.moved = true;
    drag.x = x; drag.y = y;
  });
  canvas.addEventListener("pointerup", (e) => {
    if (!drag) return;
    const { x, y } = localXY(e);
    if (drag.moved) {
      const { col, row } = slotOf(x, y);
      const res = dropCell(state, drag.cell, col, row);
      if (res === "merge") { sfx.chime(); floatAt(px(col), py(row), "합체!", "#ffd36b"); burstAt(px(col), py(row), `hsl(${state.cfg.tiers[Math.min(drag.cell.tier, 3)].hue} 70% 60%)`); }
    }
    drag = null;
    canvas.releasePointerCapture?.(e.pointerId);
  });

  root.querySelectorAll<HTMLElement>(".d-btn[data-mode]").forEach((b) => {
    b.addEventListener("click", () => {
      mode = b.dataset.mode as typeof mode;
      root.querySelectorAll(".d-btn[data-mode]").forEach((x) => x.classList.toggle("on", x === b));
    });
  });
  (root.querySelector('[data-act="restart"]') as HTMLElement).addEventListener("click", () => {
    state = createDefenseState(DEFENSE_CONFIG); mode = "cell";
    root.querySelectorAll(".d-btn[data-mode]").forEach((x) => x.classList.toggle("on", (x as HTMLElement).dataset.mode === "cell"));
  });

  // 화면 좌표 헬퍼(플로팅/파티클)
  function toScreen(lx: number, ly: number) {
    const rect = canvas.getBoundingClientRect();
    return { x: rect.left + lx, y: rect.top + ly };
  }
  const floatAt = (lx: number, ly: number, t: string, c: string) => { const s = toScreen(lx, ly); floatText(s.x, s.y, t, c); };
  const burstAt = (lx: number, ly: number, c: string) => { const s = toScreen(lx, ly); burst(s.x, s.y, c, 10); };

  // ── 이벤트(사운드/이펙트) ──
  function processEvents() {
    for (const ev of state.events) {
      if (ev.kind === "merge") { /* handled at drop */ }
      else if (ev.kind === "nofunds") { sfx.blocked(); }
      else if (ev.kind === "hitcore") { sfx.blocked(); }
      else if (ev.kind === "wave") { sfx.phase(); }
      else if (ev.kind === "kill" && ev.col !== undefined && ev.y !== undefined) {
        if (Math.random() < 0.5) burstAt(px(ev.col), py(ev.y), "#ffd36b");
      }
    }
    state.events.length = 0;
  }

  // ── 렌더 ──
  function render() {
    ctx.clearRect(0, 0, W, H);
    // 배경(몸 내부)
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, "#2a2331"); bg.addColorStop(1, "#171420");
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    // 슬롯 그리드
    for (let c = 0; c < COLS; c++) for (let rw = 0; rw < ROWS; rw++) {
      roundRect(ctx, c * colW + 3, py(rw) - rowH / 2 + 2, colW - 6, rowH - 4, 9);
      ctx.fillStyle = ((c + rw) % 2 === 0) ? "rgba(255,255,255,.028)" : "rgba(255,255,255,.015)";
      ctx.fill();
    }
    // 거점 막(하단)
    const coreY = H - coreH;
    const chp = Math.max(0, state.coreHp) / state.coreMax;
    ctx.fillStyle = "#0d0b12"; ctx.fillRect(0, coreY, W, coreH);
    ctx.fillStyle = chp > 0.35 ? "hsl(150 55% 40%)" : "hsl(8 70% 48%)";
    ctx.fillRect(0, coreY, W * chp, coreH);
    ctx.fillStyle = "rgba(255,255,255,.9)"; ctx.font = "700 12px Jua, system-ui"; ctx.textAlign = "center";
    ctx.fillText("내 몸 (거점)", W / 2, coreY + 19);

    // 세포/성벽
    for (const c of state.cells) drawCell(ctx, px(c.col), py(c.row), r, c, drag?.cell.id === c.id);
    // 투사체
    for (const p of state.projectiles) {
      ctx.beginPath(); ctx.arc(px(p.col), py(p.y), 3.5, 0, 7);
      ctx.fillStyle = `hsl(${p.hue} 85% 66%)`; ctx.shadowColor = `hsl(${p.hue} 85% 66%)`; ctx.shadowBlur = 6; ctx.fill(); ctx.shadowBlur = 0;
    }
    // 적
    for (const e of state.enemies) {
      const d = state.cfg.enemies[e.type];
      drawEnemy(ctx, px(e.col), py(e.y), r * (d.boss ? 1.55 : 1), d.hue, e.hp / e.maxHp, e.hit > 0, !!d.boss);
    }
    // 드래그 고스트
    if (drag) drawCell(ctx, drag.x, drag.y, r * 1.08, drag.cell, false, 0.5);

    // HUD 갱신
    el.wave.textContent = state.wave < 0 ? "–" : `${state.wave + 1}/${state.totalWaves}`;
    el.energy.textContent = String(Math.floor(state.energy));
    el.coref.style.width = (chp * 100).toFixed(0) + "%";
    el.ef.style.width = Math.min(100, state.energy / 1.5).toFixed(0) + "%";

    renderOverlay();
  }

  let lastStatus = "";
  function renderOverlay() {
    if (state.status === lastStatus) return; // 상태 변화 시에만 오버레이 재구성
    lastStatus = state.status;
    if (state.status === "ready") {
      overlay.hidden = false;
      overlay.innerHTML = `<div class="d-card"><div class="d-t">내몸을 지켜라</div>
        <p>몰려오는 <b>유해균·질병세포</b>로부터 거점을 지키세요.<br>
        빈 칸을 눌러 <b>호중구</b>를 놓고, 같은 세포를 <b>드래그해 합쳐</b> 더 강한 세포로!<br>
        <small>호중구 → 대식세포 → T세포 → NK세포</small></p>
        <button class="d-start" data-act="start">시작하기</button>
        <p class="d-disc">게임이며 의학 정보가 아닙니다.</p></div>`;
      const sb = overlay.querySelector('[data-act="start"]') as HTMLElement | null;
      if (sb) sb.addEventListener("click", () => { startGame(state); sfx.phase(); });
    } else if (state.status === "won") {
      overlay.hidden = false;
      overlay.innerHTML = `<div class="d-card"><div class="d-t win">🏆 방어 성공!</div>
        <p>거점을 지켜냈습니다. 처치 <b>${state.kills}</b> · 거점 <b>${Math.ceil(state.coreHp)}</b> 유지</p>
        <button class="d-start" data-act="restart2">다시 도전</button></div>`;
      wire2();
    } else if (state.status === "lost") {
      overlay.hidden = false;
      overlay.innerHTML = `<div class="d-card"><div class="d-t lose">거점 붕괴…</div>
        <p>웨이브 ${state.wave + 1}에서 무너졌습니다. 처치 <b>${state.kills}</b></p>
        <button class="d-start" data-act="restart2">다시 도전</button></div>`;
      wire2();
    } else {
      overlay.hidden = true;
    }
  }
  function wire2() {
    const b = overlay.querySelector('[data-act="restart2"]') as HTMLElement | null;
    if (b) b.addEventListener("click", () => { state = createDefenseState(DEFENSE_CONFIG); startGame(state); sfx.phase(); });
  }

  let wonFx = false, lostFx = false;
  function frame(now: number) {
    if (!running) return;
    const dt = last ? (now - last) / 1000 : 0;
    last = now;
    step(state, dt);
    processEvents();
    if (state.status === "won" && !wonFx) { wonFx = true; lostFx = false; sfx.win(); confetti(); }
    if (state.status === "lost" && !lostFx) { lostFx = true; sfx.blocked(); }
    if (state.status === "playing") { wonFx = false; lostFx = false; }
    render();
    requestAnimationFrame(frame);
  }

  function onResize() { layout(); }
  window.addEventListener("resize", onResize);
  layout();

  return {
    show() { running = true; last = 0; layout(); requestAnimationFrame(frame); },
    hide() { running = false; },
  };
}

// ── 캔버스 그리기 헬퍼 ──────────────────────────────────────────
function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, rad: number) {
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

const TIER_HUE = [205, 150, 275, 340];
function drawCell(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, c: Cell, dragging: boolean, alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;
  if (c.kind === "wall") {
    roundRect(ctx, cx - r, cy - r, r * 2, r * 2, r * 0.4);
    const g = ctx.createLinearGradient(cx, cy - r, cx, cy + r);
    g.addColorStop(0, "hsl(150 30% 52%)"); g.addColorStop(1, "hsl(150 30% 32%)");
    ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = "hsl(150 30% 26%)"; ctx.lineWidth = 2; ctx.stroke();
    hpBar(ctx, cx, cy + r + 3, r, c.hp / c.maxHp);
    ctx.restore(); return;
  }
  const hue = TIER_HUE[c.tier - 1] ?? 205;
  const g = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.35, r * 0.2, cx, cy, r);
  g.addColorStop(0, `hsl(${hue} 66% 74%)`); g.addColorStop(0.6, `hsl(${hue} 55% 56%)`); g.addColorStop(1, `hsl(${hue} 50% 40%)`);
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.fillStyle = g; ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = `hsl(${hue} 50% 32%)`; ctx.stroke();
  // 얼굴
  const ink = `hsl(${hue} 45% 22%)`;
  ctx.fillStyle = ink;
  ctx.beginPath(); ctx.ellipse(cx - r * 0.3, cy - r * 0.03, r * 0.12, r * 0.17, 0, 0, 7); ctx.fill();
  ctx.beginPath(); ctx.ellipse(cx + r * 0.3, cy - r * 0.03, r * 0.12, r * 0.17, 0, 0, 7); ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.beginPath(); ctx.arc(cx - r * 0.25, cy - r * 0.1, r * 0.045, 0, 7); ctx.fill();
  ctx.beginPath(); ctx.arc(cx + r * 0.35, cy - r * 0.1, r * 0.045, 0, 7); ctx.fill();
  ctx.strokeStyle = ink; ctx.lineWidth = Math.max(1, r * 0.08); ctx.lineCap = "round";
  ctx.beginPath(); ctx.arc(cx, cy + r * 0.1, r * 0.26, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
  // 티어 핍(금색)
  for (let i = 0; i < c.tier; i++) {
    const a = -Math.PI / 2 + (i - (c.tier - 1) / 2) * 0.5;
    ctx.beginPath(); ctx.arc(cx + Math.cos(a) * r * 0.72, cy + Math.sin(a) * r * 0.72, r * 0.1, 0, 7);
    ctx.fillStyle = "#ffd36b"; ctx.fill();
  }
  if (c.flash > 0) { ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.fillStyle = `rgba(255,255,255,${Math.min(0.6, c.flash * 2)})`; ctx.fill(); }
  if (c.hp < c.maxHp) hpBar(ctx, cx, cy + r + 3, r, c.hp / c.maxHp);
  ctx.restore();
  void dragging;
}

function drawEnemy(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, hue: number, hpFrac: number, hit: boolean, boss: boolean) {
  ctx.save();
  // 가시(스파이크)
  const spikes = boss ? 14 : 9;
  ctx.beginPath();
  for (let i = 0; i < spikes * 2; i++) {
    const a = (i / (spikes * 2)) * Math.PI * 2;
    const rr = i % 2 === 0 ? r * 1.28 : r * 0.96;
    const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  }
  ctx.closePath();
  const g = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, r * 0.2, cx, cy, r * 1.2);
  g.addColorStop(0, `hsl(${hue} 55% 52%)`); g.addColorStop(1, `hsl(${hue} 60% 30%)`);
  ctx.fillStyle = g; ctx.fill();
  ctx.strokeStyle = `hsl(${hue} 60% 22%)`; ctx.lineWidth = 1.5; ctx.stroke();
  // 성난 눈
  const ink = `hsl(${hue} 70% 14%)`;
  ctx.fillStyle = ink;
  ctx.beginPath(); ctx.ellipse(cx - r * 0.32, cy - r * 0.02, r * 0.14, r * 0.1, -0.4, 0, 7); ctx.fill();
  ctx.beginPath(); ctx.ellipse(cx + r * 0.32, cy - r * 0.02, r * 0.14, r * 0.1, 0.4, 0, 7); ctx.fill();
  ctx.strokeStyle = ink; ctx.lineWidth = Math.max(1, r * 0.09); ctx.lineCap = "round";
  ctx.beginPath(); ctx.arc(cx, cy + r * 0.5, r * 0.24, 1.15 * Math.PI, 1.85 * Math.PI); ctx.stroke(); // 찡그림
  if (hit) { ctx.beginPath(); ctx.arc(cx, cy, r * 1.1, 0, 7); ctx.fillStyle = "rgba(255,255,255,.7)"; ctx.fill(); }
  hpBar(ctx, cx, cy - r * 1.4, r * (boss ? 1.2 : 1), hpFrac, boss);
  ctx.restore();
}

function hpBar(ctx: CanvasRenderingContext2D, cx: number, y: number, r: number, frac: number, big = false) {
  const w = r * 2 * (big ? 1.3 : 1), h = big ? 4 : 3;
  ctx.fillStyle = "rgba(0,0,0,.5)"; ctx.fillRect(cx - w / 2, y, w, h);
  ctx.fillStyle = frac > 0.4 ? "#7fe0a6" : "#ff8f9c"; ctx.fillRect(cx - w / 2, y, w * Math.max(0, frac), h);
}

let cssInjected = false;
function injectCss() {
  if (cssInjected) return; cssInjected = true;
  const css = `
  .d-root { max-width:480px; margin:0 auto; font-family:'Noto Sans KR',system-ui,sans-serif; color:#f5f0f7; padding:8px 10px 12px; box-sizing:border-box; }
  .d-top { display:flex; justify-content:space-between; align-items:center; font-size:13px; margin-bottom:6px; }
  .d-top b { font-family:'Jua',sans-serif; }
  .d-core { display:flex; align-items:center; gap:6px; }
  .d-bar { width:70px; height:9px; background:rgba(0,0,0,.35); border-radius:99px; overflow:hidden; }
  .d-bar.wide { flex:1; }
  .d-coref { height:100%; background:linear-gradient(90deg,#7fe0a6,#6cc6f5); border-radius:99px; transition:width .2s; }
  .d-energy { display:flex; align-items:center; gap:6px; font-size:13px; margin-bottom:8px; }
  .d-energy b { font-family:'Jua',sans-serif; color:#ffd36b; min-width:26px; }
  .d-ef { height:100%; background:linear-gradient(90deg,#ffd36b,#ffb27a); border-radius:99px; transition:width .15s; }
  .d-arena { position:relative; }
  .d-arena canvas { display:block; width:100%; border-radius:16px; box-shadow:0 8px 26px rgba(0,0,0,.4); touch-action:none; }
  .d-controls { display:flex; gap:8px; margin-top:10px; }
  .d-btn { flex:1; background:#352f40; color:#f5f0f7; border:none; border-radius:14px; padding:12px 6px; font:inherit; font-size:14px; cursor:pointer; box-shadow:0 3px 0 rgba(0,0,0,.2); }
  .d-btn small { display:block; font-size:11px; color:#ada3ba; margin-top:2px; }
  .d-btn.on { background:linear-gradient(160deg,#8fe9b6,#6fe0a6); color:#16311f; }
  .d-btn.ghost { flex:0 0 auto; background:#2b2634; }
  .d-btn:active { transform:translateY(2px); box-shadow:0 1px 0 rgba(0,0,0,.2); }
  .d-overlay { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; padding:18px; background:rgba(15,10,20,.72); backdrop-filter:blur(3px); border-radius:16px; }
  .d-overlay[hidden] { display:none; }
  .d-card { background:#2b2634; border-radius:18px; padding:22px 20px; text-align:center; max-width:340px; box-shadow:0 10px 30px rgba(0,0,0,.5); }
  .d-t { font-family:'Jua',sans-serif; font-size:26px; margin-bottom:10px; }
  .d-t.win { color:#7fe0a6; } .d-t.lose { color:#ff8f9c; }
  .d-card p { font-size:13px; line-height:1.7; color:#d8d0e0; margin:0 0 14px; }
  .d-card small { color:#ada3ba; }
  .d-start { background:linear-gradient(160deg,#8fe9b6,#6fe0a6); color:#16311f; font-family:'Jua',sans-serif; font-size:16px; border:none; border-radius:14px; padding:13px 22px; cursor:pointer; box-shadow:0 4px 0 #3fae74; }
  .d-start:active { transform:translateY(2px); box-shadow:0 2px 0 #3fae74; }
  .d-disc { font-size:10px; color:#8a8194; margin:12px 0 0; }
  `;
  const s = document.createElement("style"); s.textContent = css; document.head.appendChild(s);
}
