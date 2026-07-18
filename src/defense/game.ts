// defense/game.ts
// 《내몸을 지켜라》 컨트롤러: 캔버스 렌더 + 입력(놓기/드래그/합체) + HUD + RAF 루프.
// 사운드/이펙트는 game/juice.ts 재활용.

import {
  COLS, ROWS, createDefenseState, startGame, step, placeCell, placeWall,
  cellAt, dropCell, buyUpgrade, nextWave, shopCost,
  skillNk, skillHeal, skillEnergy, skillWall, type DefenseState, type Cell,
} from "./engine";
import { DEFENSE_CONFIG, SHOP, HERO_SKILLS, ORGANS, ORGAN_INFO, type OrganKey } from "./content";
import { loadMeta, saveMeta, META_SHOP, metaCost, metaMaxed, buyMeta, metaBonus, runReward } from "./meta";
import { UNITS } from "../content/units";
import { unitAvatar } from "../game/art";
import { sfx, floatText, burst, confetti } from "../game/juice";

const ENEMY_NAME: Record<string, string> = { badbac: "유해균", inflam: "염증세포", boss_cancer: "암세포" };

export function createDefenseGame(root: HTMLElement) {
  injectCss();
  root.classList.add("d-root");
  root.innerHTML = `
    <div class="d-top">
      <div>웨이브 <b id="d-wave">–</b> <span id="d-organ" class="d-organ"></span></div>
      <div class="d-core">🛡<div class="d-bar"><div id="d-coref" class="d-coref"></div></div></div>
    </div>
    <div class="d-energy">⚡<b id="d-energy">0</b><div class="d-bar wide"><div id="d-ef" class="d-ef"></div></div><span class="d-ip">🧬<b id="d-ip">0</b></span></div>
    <div class="d-arena"><canvas id="d-canvas"></canvas><div id="d-overlay" class="d-overlay"></div></div>
    <div class="d-skills">${HERO_SKILLS.map((h) => {
      const u = UNITS.find((x) => x.id === h.unit);
      return `<button class="d-skill" data-skill="${h.id}" title="${h.name}">
        <span class="dk-art">${u ? unitAvatar(u, 34) : h.icon}</span>
        <span class="dk-nm">${h.name}</span><span class="dk-cost">${h.cost ? "⚡" + h.cost : "무료"}</span>
        <span class="dk-cd"></span></button>`;
    }).join("")}</div>
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
    organ: root.querySelector("#d-organ") as HTMLElement,
    energy: root.querySelector("#d-energy") as HTMLElement,
    coref: root.querySelector("#d-coref") as HTMLElement,
    ef: root.querySelector("#d-ef") as HTMLElement,
    ip: root.querySelector("#d-ip") as HTMLElement,
  };

  const meta = loadMeta();
  const newRun = () => createDefenseState(DEFENSE_CONFIG, metaBonus(meta));
  let state = newRun();
  let lastAward = 0;
  let mode: "cell" | "wall" = "cell";
  // 영웅 스킬 쿨다운 + 마스코트 이미지(캔버스 연출용)
  const skillCd: Record<string, number> = {};
  const heroImg: Record<string, HTMLImageElement> = {};
  for (const h of HERO_SKILLS) {
    const u = UNITS.find((x) => x.id === h.unit);
    if (u) { const im = new Image(); im.src = "data:image/svg+xml;utf8," + encodeURIComponent(unitAvatar(u, 96)); heroImg[h.id] = im; }
  }
  // 연출(fx) 시스템
  type Fx = { kind: string; x: number; y: number; vx: number; vy: number; r: number; life: number; max: number; color: string; text?: string; img?: HTMLImageElement };
  const fx: Fx[] = [];
  let shake = 0, banner = "", bannerLife = 0, flash = 0, flashColor = "#fff";
  const addNum = (x: number, y: number, text: string, color: string) => fx.push({ kind: "num", x, y, vx: 0, vy: -34, r: 0, life: 0.85, max: 0.85, color, text });
  const addSpark = (x: number, y: number, color: string, n = 5) => { for (let i = 0; i < n; i++) { const a = Math.random() * 7, s = 40 + Math.random() * 70; fx.push({ kind: "spark", x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, r: 2 + Math.random() * 2, life: 0.4, max: 0.4, color }); } };
  const addRing = (x: number, y: number, color: string, rMax = 40) => fx.push({ kind: "ring", x, y, vx: 0, vy: 0, r: rMax, life: 0.5, max: 0.5, color });
  const addHeroPop = (id: string) => { const im = heroImg[id]; if (im) fx.push({ kind: "hero", x: 0, y: 0, vx: 0, vy: 0, r: 0, life: 0.9, max: 0.9, color: "", img: im }); };
  const showBanner = (t: string) => { banner = t; bannerLife = 1.4; };
  const doFlash = (c: string) => { flash = 0.5; flashColor = c; };
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
    state = newRun(); mode = "cell";
    root.querySelectorAll(".d-btn[data-mode]").forEach((x) => x.classList.toggle("on", (x as HTMLElement).dataset.mode === "cell"));
  });

  const skillBtns = Array.from(root.querySelectorAll<HTMLElement>(".d-skill"));
  skillBtns.forEach((b) => b.addEventListener("click", () => castSkill(b.dataset.skill!)));
  function castSkill(id: string) {
    if (state.status !== "playing") return;
    const h = HERO_SKILLS.find((x) => x.id === id); if (!h) return;
    if ((skillCd[id] ?? 0) > 0) { sfx.blocked(); return; }
    if (state.energy < h.cost) { sfx.blocked(); addNum(W / 2, 50, "에너지 부족", "#ff8f9c"); return; }
    state.energy -= h.cost;
    skillCd[id] = h.cd;
    if (h.effect === "nk") { skillNk(state, 240); doFlash("rgba(255,80,120,.35)"); shake = 9; for (let c = 0; c < COLS; c++) addSpark(px(c), py(1.5), "#ff8f9c", 6); }
    else if (h.effect === "wall") { skillWall(state, 360, 8); for (let c = 0; c < COLS; c++) addRing(px(c), py(1), "#8fe9b6", 30); }
    else if (h.effect === "heal") { skillHeal(state); doFlash("rgba(120,230,170,.28)"); for (const c of state.cells) addRing(px(c.col), py(c.row), "#8fe9b6", 22); }
    else { skillEnergy(state, 60); addNum(W / 2, 60, "⚡ +60", "#ffd36b"); }
    addHeroPop(id); sfx.chime();
  }
  function updateSkillBar() {
    for (const b of skillBtns) {
      const id = b.dataset.skill!; const h = HERO_SKILLS.find((x) => x.id === id)!;
      const cd = skillCd[id] ?? 0;
      const cdEl = b.querySelector(".dk-cd") as HTMLElement;
      cdEl.style.height = (cd > 0 ? (cd / h.cd) * 100 : 0) + "%";
      cdEl.textContent = cd > 0 ? String(Math.ceil(cd)) : "";
      b.classList.toggle("ready", cd <= 0 && state.energy >= h.cost && state.status === "playing");
    }
  }

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
      else if (ev.kind === "hitcore") { sfx.blocked(); shake = Math.max(shake, 5); doFlash("rgba(255,60,60,.22)"); }
      else if (ev.kind === "wave") { sfx.phase(); showBanner(`WAVE ${state.wave + 1}`); }
      else if (ev.kind === "boss") { sfx.win(); showBanner("⚠ 보스 등장!"); doFlash("rgba(200,80,255,.35)"); shake = Math.max(shake, 10); }
      else if (ev.kind === "hit" && ev.col !== undefined && ev.y !== undefined) {
        addSpark(px(ev.col), py(ev.y), "#ffe6a3", 3);
        if ((ev.n ?? 0) >= 18 || Math.random() < 0.5) addNum(px(ev.col), py(ev.y), String(ev.n ?? 0), (ev.n ?? 0) >= 30 ? "#ffd36b" : "#fff");
      }
      else if (ev.kind === "kill" && ev.col !== undefined && ev.y !== undefined) {
        addRing(px(ev.col), py(ev.y), "#ffd36b", 24);
        if (Math.random() < 0.4) burstAt(px(ev.col), py(ev.y), "#ffd36b");
      }
      else if (ev.kind === "spawn" && ev.col !== undefined && ev.y !== undefined) {
        sfx.circulate(); addRing(px(ev.col), py(ev.y), "#8fe9b6", 22);
      }
    }
    state.events.length = 0;
  }
  function updateFx(dt: number) {
    shake = Math.max(0, shake - dt * 26);
    flash = Math.max(0, flash - dt);
    bannerLife = Math.max(0, bannerLife - dt);
    if (state.status === "playing") for (const k in skillCd) if (skillCd[k] > 0) skillCd[k] = Math.max(0, skillCd[k] - dt);
    for (const f of fx) { f.life -= dt; f.x += f.vx * dt; f.y += f.vy * dt; if (f.kind === "spark") f.vy += 130 * dt; }
    for (let i = fx.length - 1; i >= 0; i--) if (fx[i].life <= 0) fx.splice(i, 1);
  }
  function drawFxWorld() {
    for (const f of fx) {
      const a = Math.max(0, f.life / f.max);
      if (f.kind === "num") { ctx.globalAlpha = a; ctx.fillStyle = f.color; ctx.font = "700 14px Jua, system-ui"; ctx.textAlign = "center"; ctx.fillText(f.text!, f.x, f.y); ctx.globalAlpha = 1; }
      else if (f.kind === "spark") { ctx.globalAlpha = a; ctx.fillStyle = f.color; ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, 7); ctx.fill(); ctx.globalAlpha = 1; }
      else if (f.kind === "ring") { ctx.globalAlpha = a * 0.8; ctx.strokeStyle = f.color; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (1 - a), 0, 7); ctx.stroke(); ctx.globalAlpha = 1; }
    }
  }
  function drawFxScreen() {
    if (flash > 0) { ctx.globalAlpha = Math.min(1, flash / 0.5); ctx.fillStyle = flashColor; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }
    const hero = fx.find((f) => f.kind === "hero");
    if (hero && hero.img) { const a = hero.life / hero.max; const sc = 1.4 - a * 0.4; const s = 96 * sc; ctx.globalAlpha = Math.min(1, a * 1.6); ctx.drawImage(hero.img, W / 2 - s / 2, H * 0.36 - s / 2, s, s); ctx.globalAlpha = 1; }
    if (bannerLife > 0) {
      const a = Math.min(1, bannerLife / 0.4);
      ctx.globalAlpha = a; ctx.textAlign = "center";
      ctx.font = "700 30px Jua, system-ui"; ctx.fillStyle = "#fff"; ctx.strokeStyle = "rgba(0,0,0,.5)"; ctx.lineWidth = 4;
      ctx.strokeText(banner, W / 2, H * 0.28); ctx.fillText(banner, W / 2, H * 0.28); ctx.globalAlpha = 1;
    }
  }

  // ── 렌더 ──
  function render() {
    ctx.fillStyle = "#120f18"; ctx.fillRect(0, 0, W, H);
    ctx.save();
    if (shake > 0) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
    // 배경: 장기 아레나 (웨이브마다 다른 장기)
    const organ = ORGANS[Math.max(0, state.wave) % ORGANS.length];
    drawOrganBackground(ctx, organ, W, H - coreH, state.time);
    // 방어 구역(하단 2행 = 내 조직) — 기지 지대 표시
    const zoneY = py(ROWS - 2) - rowH / 2;
    const zg = ctx.createLinearGradient(0, zoneY, 0, H - coreH);
    zg.addColorStop(0, "rgba(111,224,166,0)"); zg.addColorStop(1, "rgba(111,224,166,.1)");
    ctx.fillStyle = zg; ctx.fillRect(0, zoneY, W, (H - coreH) - zoneY);
    ctx.strokeStyle = "rgba(111,224,166,.28)"; ctx.lineWidth = 1.5; ctx.setLineDash([7, 6]);
    ctx.beginPath(); ctx.moveTo(0, zoneY); ctx.lineTo(W, zoneY); ctx.stroke(); ctx.setLineDash([]);
    // 슬롯 그리드
    for (let c = 0; c < COLS; c++) for (let rw = 0; rw < ROWS; rw++) {
      roundRect(ctx, c * colW + 3, py(rw) - rowH / 2 + 2, colW - 6, rowH - 4, 10);
      ctx.fillStyle = "rgba(255,255,255,.04)"; ctx.fill();
      ctx.lineWidth = 1; ctx.strokeStyle = "rgba(255,255,255,.05)"; ctx.stroke();
    }
    // 장기 이름(은은하게)
    ctx.fillStyle = "rgba(255,255,255,.32)"; ctx.font = "700 12px Jua, system-ui"; ctx.textAlign = "center";
    ctx.fillText(ORGAN_INFO[organ].name + " 방어", W / 2, 20);
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
      drawEnemy(ctx, px(e.col), py(e.y), r * (d.boss ? 1.55 : 1), e.type, d.hue, e.hp / e.maxHp, e.hit > 0, !!d.boss, state.time);
    }
    // 드래그 고스트
    if (drag) drawCell(ctx, drag.x, drag.y, r * 1.08, drag.cell, false, 0.5);
    drawFxWorld();
    ctx.restore();
    drawFxScreen();
    updateSkillBar();

    // HUD 갱신
    el.wave.textContent = state.wave < 0 ? "–" : `${state.wave + 1}/${state.totalWaves}`;
    el.organ.textContent = ORGAN_INFO[organ].trait;
    el.energy.textContent = String(Math.floor(state.energy));
    el.coref.style.width = (chp * 100).toFixed(0) + "%";
    el.ef.style.width = Math.min(100, state.energy / 1.5).toFixed(0) + "%";
    el.ip.textContent = String(state.ip);

    renderOverlay();
  }

  let lastStatus = "";
  function renderOverlay() {
    if (state.status === lastStatus) return; // 상태 변화 시에만 오버레이 재구성
    lastStatus = state.status;
    if (state.status === "ready") {
      renderLobby();
    } else if (state.status === "won") {
      overlay.hidden = false;
      overlay.innerHTML = `<div class="d-card"><div class="d-t win">🏆 방어 성공!</div>
        <p>모든 웨이브를 막아냈습니다. 처치 <b>${state.kills}</b> · 거점 <b>${Math.ceil(state.coreHp)}</b> 유지</p>
        <p class="d-award">🧫 항체 <b>+${lastAward}</b> 획득</p>
        <div class="d-endbtns"><button class="d-start alt" data-act="lobby">🧫 강화(로비)</button><button class="d-start" data-act="restart2">다시 도전</button></div></div>`;
      wire2();
    } else if (state.status === "lost") {
      overlay.hidden = false;
      overlay.innerHTML = `<div class="d-card"><div class="d-t lose">거점 붕괴…</div>
        <p>웨이브 ${state.wave + 1}에서 무너졌습니다. 처치 <b>${state.kills}</b></p>
        <p class="d-award">🧫 항체 <b>+${lastAward}</b> 획득</p>
        <div class="d-endbtns"><button class="d-start alt" data-act="lobby">🧫 강화(로비)</button><button class="d-start" data-act="restart2">다시 도전</button></div></div>`;
      wire2();
    } else if (state.status === "shop") {
      renderShopPanel();
    } else {
      overlay.hidden = true;
    }
  }
  function wire2() {
    const b = overlay.querySelector('[data-act="restart2"]') as HTMLElement | null;
    if (b) b.addEventListener("click", () => { state = newRun(); startGame(state); sfx.phase(); });
    const lb = overlay.querySelector('[data-act="lobby"]') as HTMLElement | null;
    if (lb) lb.addEventListener("click", () => { state = newRun(); sfx.chime(); });
  }
  function renderLobby() {
    overlay.hidden = false;
    const items = META_SHOP.map((it) => {
      const cost = metaCost(meta, it);
      const lv = meta.up[it.id] ?? 0;
      const maxed = metaMaxed(meta, it);
      const can = !maxed && meta.antibody >= cost;
      return `<button class="d-shop-item ${can ? "" : "dis"}" data-meta="${it.id}" ${can ? "" : "disabled"}>
        <span class="si-ic">${it.icon}</span>
        <span class="si-tx"><b>${it.name}</b> <small>Lv${lv}/${it.max}</small><br><small>${it.desc}</small></span>
        <span class="si-cost">${maxed ? "MAX" : "🧫" + cost}</span></button>`;
    }).join("");
    overlay.innerHTML = `<div class="d-card shop"><div class="d-t">내몸을 지켜라</div>
      <p>세포를 놓고 <b>합쳐</b>(호중구→NK) 유해균으로부터 거점을 지키세요.</p>
      <div class="d-meta-h">🧫 항체 <b>${meta.antibody}</b> · 영구 강화</div>
      <div class="d-shop">${items}</div>
      <button class="d-start" data-act="start">▶ 시작 (8웨이브)</button>
      <p class="d-disc">게임이며 의학 정보가 아닙니다.</p></div>`;
    overlay.querySelectorAll<HTMLElement>("[data-meta]").forEach((b) => b.addEventListener("click", () => {
      const it = META_SHOP.find((x) => x.id === b.dataset.meta)!;
      if (buyMeta(meta, it)) { sfx.chime(); state = newRun(); } else sfx.blocked();
      renderLobby();
    }));
    const sb = overlay.querySelector('[data-act="start"]') as HTMLElement | null;
    if (sb) sb.addEventListener("click", () => { startGame(state); sfx.phase(); });
  }
  function renderShopPanel() {
    overlay.hidden = false;
    const nextOrgan = ORGANS[(state.wave + 1) % ORGANS.length];
    const items = SHOP.map((it) => {
      const cost = shopCost(state, it);
      const lv = state.upg[it.id] ?? 0;
      const can = state.ip >= cost;
      return `<button class="d-shop-item ${can ? "" : "dis"}" data-buy="${it.id}" ${can ? "" : "disabled"}>
        <span class="si-ic">${it.icon}</span>
        <span class="si-tx"><b>${it.name}</b>${lv ? ` <small>Lv${lv}</small>` : ""}<br><small>${it.desc}</small></span>
        <span class="si-cost">🧬${cost}</span></button>`;
    }).join("");
    overlay.innerHTML = `<div class="d-card shop"><div class="d-t win">웨이브 ${state.wave + 1} 클리어! 🎉</div>
      <p>면역 포인트 <b>🧬${state.ip}</b> · 강화로 다음 침입에 대비하세요.</p>
      <div class="d-shop">${items}</div>
      <button class="d-start" data-act="next">다음 웨이브 → ${ORGAN_INFO[nextOrgan].name}</button></div>`;
    overlay.querySelectorAll<HTMLElement>("[data-buy]").forEach((b) => b.addEventListener("click", () => {
      const it = SHOP.find((x) => x.id === b.dataset.buy)!;
      if (buyUpgrade(state, it)) sfx.chime(); else sfx.blocked();
      renderShopPanel();
    }));
    const nb = overlay.querySelector('[data-act="next"]') as HTMLElement | null;
    if (nb) nb.addEventListener("click", () => { nextWave(state); sfx.phase(); });
  }

  let wonFx = false, lostFx = false;
  function frame(now: number) {
    if (!running) return;
    const dt = last ? (now - last) / 1000 : 0;
    last = now;
    step(state, dt);
    processEvents();
    updateFx(dt);
    if (state.status === "won" && !wonFx) {
      wonFx = true; lostFx = false;
      lastAward = runReward(state.totalWaves, state.kills, true);
      meta.antibody += lastAward; saveMeta(meta);
      sfx.win(); confetti();
    }
    if (state.status === "lost" && !lostFx) {
      lostFx = true;
      lastAward = runReward(Math.max(0, state.wave), state.kills, false);
      meta.antibody += lastAward; saveMeta(meta);
      sfx.blocked();
    }
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

// 각도→반지름 함수로 닫힌 실루엣 경로
function polarPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, fn: (a: number) => number, steps = 44) {
  ctx.beginPath();
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    const rr = fn(a);
    const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  }
  ctx.closePath();
}

function cellFace(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, ink: string) {
  ctx.fillStyle = ink;
  ctx.beginPath(); ctx.ellipse(cx - r * 0.3, cy - r * 0.03, r * 0.12, r * 0.17, 0, 0, 7); ctx.fill();
  ctx.beginPath(); ctx.ellipse(cx + r * 0.3, cy - r * 0.03, r * 0.12, r * 0.17, 0, 0, 7); ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.beginPath(); ctx.arc(cx - r * 0.25, cy - r * 0.1, r * 0.045, 0, 7); ctx.fill();
  ctx.beginPath(); ctx.arc(cx + r * 0.35, cy - r * 0.1, r * 0.045, 0, 7); ctx.fill();
  ctx.strokeStyle = ink; ctx.lineWidth = Math.max(1, r * 0.08); ctx.lineCap = "round";
  ctx.beginPath(); ctx.arc(cx, cy + r * 0.1, r * 0.24, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
}

function drawCell(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, c: Cell, dragging: boolean, alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;
  void dragging;
  if (c.kind === "wall") {
    // 바이오필름 방벽 — 육각 타일 방패
    polarPath(ctx, cx, cy + 1, (a) => r * 1.05 * (1 + 0.06 * Math.cos(6 * a)), 6);
    const g = ctx.createLinearGradient(cx, cy - r, cx, cy + r);
    g.addColorStop(0, "hsl(158 34% 54%)"); g.addColorStop(1, "hsl(158 34% 32%)");
    ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = "hsl(158 34% 24%)"; ctx.lineWidth = 2.4; ctx.stroke();
    ctx.strokeStyle = "rgba(255,255,255,.25)"; ctx.lineWidth = 1;
    for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(cx, cy + 1, r * (0.4 + i * 0.28), 0, 7); ctx.stroke(); }
    hpBar(ctx, cx, cy + r + 3, r, c.hp / c.maxHp);
    ctx.restore(); return;
  }
  const hue = TIER_HUE[c.tier - 1] ?? 205;
  const g = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.35, r * 0.2, cx, cy, r * 1.25);
  g.addColorStop(0, `hsl(${hue} 68% 76%)`); g.addColorStop(0.6, `hsl(${hue} 56% 56%)`); g.addColorStop(1, `hsl(${hue} 52% 38%)`);
  const stroke = `hsl(${hue} 52% 30%)`;
  ctx.lineJoin = "round";

  if (c.tier === 1) {
    // 호중구 — 다엽핵 느낌의 우툴두툴한 원 + 과립
    polarPath(ctx, cx, cy, (a) => r * (1 + 0.07 * Math.sin(3 * a + 0.4)));
    ctx.fillStyle = g; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = stroke; ctx.stroke();
    ctx.fillStyle = `hsl(${hue} 45% 44%)`;
    for (const [dx, dy] of [[-0.35, 0.35], [0.3, 0.4], [0.05, 0.5], [-0.5, 0.05]]) {
      ctx.beginPath(); ctx.arc(cx + dx * r, cy + dy * r, r * 0.09, 0, 7); ctx.fill();
    }
  } else if (c.tier === 2) {
    // 대식세포 — 위족(pseudopod)이 뻗은 아메바
    polarPath(ctx, cx, cy, (a) => r * 1.08 * (1 + 0.13 * Math.sin(3 * a) + 0.05 * Math.sin(6 * a + 1)));
    ctx.fillStyle = g; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = stroke; ctx.stroke();
  } else if (c.tier === 3) {
    // T세포 — 각진 몸 + 수용체 가시
    ctx.strokeStyle = stroke; ctx.lineWidth = 2.2;
    for (let i = 0; i < 7; i++) {
      const a = -Math.PI / 2 + (i / 7) * Math.PI * 2;
      ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * r * 0.9, cy + Math.sin(a) * r * 0.9);
      ctx.lineTo(cx + Math.cos(a) * r * 1.22, cy + Math.sin(a) * r * 1.22); ctx.stroke();
      ctx.beginPath(); ctx.arc(cx + Math.cos(a) * r * 1.28, cy + Math.sin(a) * r * 1.28, r * 0.08, 0, 7);
      ctx.fillStyle = `hsl(${hue} 60% 60%)`; ctx.fill();
    }
    polarPath(ctx, cx, cy, (a) => r * (0.94 + 0.1 * Math.cos(6 * a)), 6);
    ctx.fillStyle = g; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = stroke; ctx.stroke();
  } else {
    // NK세포 — 결정형 스타 + 발광
    ctx.shadowColor = `hsl(${hue} 90% 60%)`; ctx.shadowBlur = 10;
    ctx.beginPath();
    for (let i = 0; i < 16; i++) {
      const a = -Math.PI / 2 + (i / 16) * Math.PI * 2;
      const rr = i % 2 === 0 ? r * 1.26 : r * 0.74;
      const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = g; ctx.fill(); ctx.shadowBlur = 0; ctx.lineWidth = 2; ctx.strokeStyle = stroke; ctx.stroke();
  }

  cellFace(ctx, cx, cy, r, `hsl(${hue} 45% 22%)`);
  for (let i = 0; i < c.tier; i++) {
    const a = -Math.PI / 2 + (i - (c.tier - 1) / 2) * 0.42;
    ctx.beginPath(); ctx.arc(cx + Math.cos(a) * r * 0.78, cy + Math.sin(a) * r * 0.78, r * 0.1, 0, 7);
    ctx.fillStyle = "#ffd36b"; ctx.fill();
  }
  if (c.flash > 0) { ctx.beginPath(); ctx.arc(cx, cy, r * 1.15, 0, 7); ctx.fillStyle = `rgba(255,255,255,${Math.min(0.6, c.flash * 2)})`; ctx.fill(); }
  if (c.hp < c.maxHp) hpBar(ctx, cx, cy + r + 4, r, c.hp / c.maxHp);
  ctx.restore();
}

function drawEnemy(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, type: string, hue: number, hpFrac: number, hit: boolean, boss: boolean, t: number) {
  ctx.save();
  ctx.lineJoin = "round";
  const g = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, r * 0.2, cx, cy, r * 1.3);
  g.addColorStop(0, `hsl(${hue} 55% 54%)`); g.addColorStop(1, `hsl(${hue} 62% 28%)`);
  const stroke = `hsl(${hue} 62% 20%)`;
  const ink = `hsl(${hue} 70% 12%)`;

  if (type === "badbac") {
    // 유해균 — 간균(막대) + 편모
    ctx.strokeStyle = `hsl(${hue} 55% 40%)`; ctx.lineWidth = 1.6; ctx.lineCap = "round";
    for (const sx of [-0.5, 0.5]) {
      ctx.beginPath(); ctx.moveTo(cx + sx * r * 0.5, cy - r * 0.7);
      ctx.quadraticCurveTo(cx + sx * r * 1.3, cy - r * 1.3 + Math.sin(t * 4 + sx) * 3, cx + sx * r * 0.9, cy - r * 1.7); ctx.stroke();
    }
    roundRect(ctx, cx - r * 0.62, cy - r * 1.05, r * 1.24, r * 2.1, r * 0.6);
    ctx.fillStyle = g; ctx.fill(); ctx.lineWidth = 1.6; ctx.strokeStyle = stroke; ctx.stroke();
  } else if (type === "inflam") {
    // 염증세포 — 뾰족한 불꽃형
    ctx.beginPath();
    for (let i = 0; i < 20; i++) {
      const a = (i / 20) * Math.PI * 2;
      const rr = i % 2 === 0 ? r * 1.35 : r * 0.82;
      const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.closePath(); ctx.fillStyle = g; ctx.fill(); ctx.lineWidth = 1.4; ctx.strokeStyle = stroke; ctx.stroke();
  } else if (type === "virus") {
    // 바이러스 — 수용체 손잡이가 달린 캡시드(육각)
    ctx.strokeStyle = `hsl(${hue} 55% 44%)`; ctx.lineWidth = 1.3; ctx.lineCap = "round";
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * r * 0.78, cy + Math.sin(a) * r * 0.78);
      ctx.lineTo(cx + Math.cos(a) * r * 1.24, cy + Math.sin(a) * r * 1.24); ctx.stroke();
      ctx.beginPath(); ctx.arc(cx + Math.cos(a) * r * 1.32, cy + Math.sin(a) * r * 1.32, r * 0.13, 0, 7);
      ctx.fillStyle = `hsl(${hue} 60% 52%)`; ctx.fill();
    }
    polarPath(ctx, cx, cy, () => r * 0.86, 6);
    ctx.fillStyle = g; ctx.fill(); ctx.lineWidth = 1.4; ctx.strokeStyle = stroke; ctx.stroke();
  } else {
    // 암세포(보스) — 여러 덩어리가 뭉친 불규칙 종괴
    for (const [dx, dy, s] of [[0, 0, 1], [-0.55, -0.2, 0.7], [0.5, -0.3, 0.65], [0.2, 0.5, 0.7], [-0.4, 0.45, 0.6]] as const) {
      ctx.beginPath(); ctx.arc(cx + dx * r, cy + dy * r, r * s, 0, 7);
      ctx.fillStyle = g; ctx.fill(); ctx.lineWidth = 1.6; ctx.strokeStyle = stroke; ctx.stroke();
    }
    ctx.fillStyle = `hsl(${hue} 50% 40%)`;
    for (const [dx, dy] of [[-0.3, -0.1], [0.35, 0.2], [0.1, 0.55]]) { ctx.beginPath(); ctx.arc(cx + dx * r, cy + dy * r, r * 0.14, 0, 7); ctx.fill(); }
  }
  // 성난 얼굴
  ctx.fillStyle = ink;
  ctx.beginPath(); ctx.ellipse(cx - r * 0.3, cy - r * 0.05, r * 0.14, r * 0.1, -0.4, 0, 7); ctx.fill();
  ctx.beginPath(); ctx.ellipse(cx + r * 0.3, cy - r * 0.05, r * 0.14, r * 0.1, 0.4, 0, 7); ctx.fill();
  ctx.strokeStyle = ink; ctx.lineWidth = Math.max(1, r * 0.09); ctx.lineCap = "round";
  ctx.beginPath(); ctx.arc(cx, cy + r * 0.5, r * 0.22, 1.15 * Math.PI, 1.85 * Math.PI); ctx.stroke();
  if (hit) { ctx.beginPath(); ctx.arc(cx, cy, r * 1.25, 0, 7); ctx.fillStyle = "rgba(255,255,255,.7)"; ctx.fill(); }
  hpBar(ctx, cx, cy - r * (boss ? 1.7 : 1.5), r * (boss ? 1.2 : 1), hpFrac, boss);
  ctx.restore();
}

// ── 장기 아레나 배경 (ORGANS/ORGAN_INFO 는 content.ts) ───────────
export function drawOrganBackground(ctx: CanvasRenderingContext2D, organ: OrganKey, W: number, H: number, t: number) {
  const { h, s } = ORGAN_INFO[organ];
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, `hsl(${h} ${s}% 15%)`); bg.addColorStop(1, `hsl(${h} ${s}% 9%)`);
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H + 40);
  ctx.save();
  ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.clip();
  const light = `hsl(${h} ${s}% 32%)`;
  if (organ === "gut") {
    // 융모(villi) — 세로 손가락 주름
    for (let i = 0; i < 7; i++) {
      const x = (i + 0.5) * (W / 7) + Math.sin(t * 0.6 + i) * 5;
      const g = ctx.createLinearGradient(x, 0, x, H);
      g.addColorStop(0, `hsla(${h} ${s}% 40% / .16)`); g.addColorStop(1, `hsla(${h} ${s}% 40% / 0)`);
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.ellipse(x, H * 0.36, W / 16, H * 0.42, 0, 0, 7); ctx.fill();
    }
  } else if (organ === "liver") {
    // 간소엽 — 육각 격자
    ctx.strokeStyle = `hsla(${h} ${s}% 42% / .16)`; ctx.lineWidth = 1.4;
    const R = W / 8;
    for (let ry = -1; ry < H / (R * 1.5) + 1; ry++) for (let rx = -1; rx < W / (R * 1.73) + 2; rx++) {
      const ox = rx * R * 1.73 + (ry % 2 ? R * 0.87 : 0), oy = ry * R * 1.5;
      polarPath(ctx, ox, oy, () => R, 6); ctx.stroke();
    }
  } else if (organ === "lung") {
    // 폐포 — 방울 군집
    for (let i = 0; i < 26; i++) {
      const x = ((i * 97) % 100) / 100 * W, y = ((i * 61) % 100) / 100 * H;
      ctx.beginPath(); ctx.arc(x, y, W * 0.05 + (i % 3) * 6, 0, 7);
      ctx.fillStyle = `hsla(${h} ${s}% 44% / .1)`; ctx.fill();
    }
  } else {
    // 심장 — 근섬유 사선 결
    ctx.strokeStyle = `hsla(${h} ${s}% 42% / .12)`; ctx.lineWidth = 2;
    for (let i = -2; i < W / 22 + 2; i++) {
      ctx.beginPath(); ctx.moveTo(i * 22, 0); ctx.lineTo(i * 22 + H * 0.4, H); ctx.stroke();
    }
  }
  // 혈관 — 갈라지는 곡선 + 은은한 맥동
  ctx.strokeStyle = `hsla(${h} ${s + 10}% 50% / ${0.14 + 0.04 * Math.sin(t * 1.5)})`;
  ctx.lineWidth = 3; ctx.lineCap = "round";
  ctx.beginPath(); ctx.moveTo(W * 0.1, -10); ctx.bezierCurveTo(W * 0.3, H * 0.3, W * 0.1, H * 0.6, W * 0.35, H + 10); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(W * 0.85, -10); ctx.bezierCurveTo(W * 0.7, H * 0.4, W * 0.95, H * 0.7, W * 0.7, H + 10); ctx.stroke();
  // 상단 광원 + 하단 비네트
  const gl = ctx.createRadialGradient(W / 2, H * 0.15, 10, W / 2, H * 0.15, W * 0.7);
  gl.addColorStop(0, `hsla(${h} ${s}% 40% / .2)`); gl.addColorStop(1, "hsla(0 0% 0% / 0)");
  ctx.fillStyle = gl; ctx.fillRect(0, 0, W, H);
  void light;
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
  .d-organ { font-size:11px; color:#c9a2f7; }
  .d-ip { display:flex; align-items:center; gap:2px; font-size:13px; flex:0 0 auto; }
  .d-ip b { font-family:'Jua',sans-serif; color:#8fe9b6; }
  .d-card.shop { max-width:360px; }
  .d-shop { display:flex; flex-direction:column; gap:8px; margin:6px 0 14px; }
  .d-shop-item { display:flex; align-items:center; gap:10px; background:#352f40; border:none; border-radius:12px; padding:10px 12px; color:#f5f0f7; font:inherit; text-align:left; cursor:pointer; box-shadow:0 2px 0 rgba(0,0,0,.2); }
  .d-shop-item:active { transform:translateY(1px); }
  .d-shop-item.dis { opacity:.45; }
  .si-ic { font-size:22px; flex:0 0 auto; }
  .si-tx { flex:1; font-size:12px; line-height:1.35; }
  .si-tx b { font-family:'Jua',sans-serif; font-size:14px; }
  .si-tx small { color:#ada3ba; }
  .si-cost { font-family:'Jua',sans-serif; color:#8fe9b6; white-space:nowrap; }
  .d-meta-h { font-size:13px; color:#c9a2f7; margin:2px 0 8px; }
  .d-meta-h b { font-family:'Jua',sans-serif; color:#e9d5ff; }
  .d-award { color:#c9a2f7; font-size:14px; margin:6px 0 12px; }
  .d-award b { font-family:'Jua',sans-serif; color:#e9d5ff; }
  .d-endbtns { display:flex; gap:8px; }
  .d-endbtns .d-start { flex:1; padding:13px 8px; font-size:14px; }
  .d-start.alt { background:linear-gradient(160deg,#d8b4fe,#c9a2f7); box-shadow:0 4px 0 #9a6fc7; color:#2b1440; }
  .d-start.alt:active { box-shadow:0 2px 0 #9a6fc7; }
  .d-ef { height:100%; background:linear-gradient(90deg,#ffd36b,#ffb27a); border-radius:99px; transition:width .15s; }
  .d-arena { position:relative; }
  .d-arena canvas { display:block; width:100%; border-radius:16px; box-shadow:0 8px 26px rgba(0,0,0,.4); touch-action:none; }
  .d-skills { display:flex; gap:7px; margin-top:9px; }
  .d-skill { position:relative; flex:1; overflow:hidden; display:flex; flex-direction:column; align-items:center; gap:1px; background:#2b2634; border:1.5px solid #413a4f; border-radius:13px; padding:6px 3px 5px; cursor:pointer; opacity:.7; transition:opacity .15s,border-color .15s; }
  .d-skill.ready { opacity:1; border-color:#8fe9b6; box-shadow:0 0 10px rgba(143,233,182,.3); }
  .d-skill:active { transform:translateY(1px); }
  .dk-art { width:34px; height:34px; display:flex; align-items:center; justify-content:center; filter:drop-shadow(0 1px 2px rgba(0,0,0,.4)); }
  .dk-nm { font-family:'Jua',sans-serif; font-size:11px; }
  .dk-cost { font-size:9px; color:#ffd36b; }
  .dk-cd { position:absolute; left:0; right:0; bottom:0; background:rgba(20,15,26,.78); color:#fff; font-family:'Jua',sans-serif; font-size:15px; display:flex; align-items:center; justify-content:center; height:0; transition:height .1s; }
  .d-controls { display:flex; gap:8px; margin-top:9px; }
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
