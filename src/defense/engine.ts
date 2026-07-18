// defense/engine.ts
// 《내몸을 지켜라》 실시간 전투 엔진 (순수). config(데이터)를 받아 상태를 step 한다.
// 좌표계: 열 col 0..COLS-1, 세로 y (float). 적은 위(y 작음)에서 아래(y 큼=거점)로 내려온다.
// 세포는 슬롯(col,row)에 놓이고 같은 열 위쪽 적을 사격. 같은 종류·티어 두 세포를 합치면 승급.

export const COLS = 5;
export const ROWS = 6;
const PROJ_SPEED = 13; // 칸/초

export interface CellDef { tier: number; name: string; hue: number; hp: number; atk: number; rate: number; range: number; }
export interface EnemyDef { type: string; name: string; hue: number; hp: number; speed: number; atk: number; bounty: number; radius: number; boss?: boolean; }
export interface WaveSpawn { type: string; n: number; gap: number; }
export interface DefenseConfig {
  tiers: CellDef[];
  enemies: Record<string, EnemyDef>;
  waves: WaveSpawn[][];
  wallHp: number; wallCost: number; t1Cost: number;
  coreHp: number; energyStart: number; energyRegen: number; intermissionSec: number;
}

export interface Cell { id: number; col: number; row: number; kind: "immune" | "wall"; tier: number; hp: number; maxHp: number; cd: number; flash: number; }
export interface Enemy { id: number; type: string; col: number; y: number; hp: number; maxHp: number; atkCd: number; hit: number; }
export interface Projectile { id: number; col: number; y: number; ty: number; dmg: number; hue: number; }
export interface Spawn { type: string; col: number; at: number; }

export interface DefenseState {
  cfg: DefenseConfig;
  cells: Cell[]; enemies: Enemy[]; projectiles: Projectile[];
  energy: number; coreHp: number; coreMax: number;
  wave: number; totalWaves: number;
  status: "ready" | "playing" | "won" | "lost";
  time: number; intermission: number;
  queue: Spawn[]; spawned: number;
  nextId: number; kills: number;
  events: { kind: "kill" | "merge" | "place" | "hitcore" | "wave" | "nofunds"; col?: number; y?: number; }[];
}

let idc = 1;
const nid = () => idc++;

export function createDefenseState(cfg: DefenseConfig): DefenseState {
  return {
    cfg, cells: [], enemies: [], projectiles: [],
    energy: cfg.energyStart, coreHp: cfg.coreHp, coreMax: cfg.coreHp,
    wave: -1, totalWaves: cfg.waves.length,
    status: "ready", time: 0, intermission: 0,
    queue: [], spawned: 0, nextId: 0, kills: 0, events: [],
  };
}

export function startGame(s: DefenseState): void {
  if (s.status !== "ready") return;
  s.status = "playing";
  loadWave(s, 0);
}

function loadWave(s: DefenseState, i: number): void {
  s.wave = i;
  const spawns: Spawn[] = [];
  let t = s.time + 0.6;
  for (const grp of s.cfg.waves[i]) {
    for (let k = 0; k < grp.n; k++) {
      spawns.push({ type: grp.type, col: Math.floor(Math.random() * COLS), at: t });
      t += grp.gap;
    }
  }
  s.queue = spawns;
  s.spawned = 0;
  s.events.push({ kind: "wave" });
}

export function cellAt(s: DefenseState, col: number, row: number): Cell | undefined {
  return s.cells.find((c) => c.col === col && c.row === row);
}

export function placeCell(s: DefenseState, col: number, row: number): boolean {
  if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return false;
  if (cellAt(s, col, row)) return false;
  if (s.energy < s.cfg.t1Cost) { s.events.push({ kind: "nofunds" }); return false; }
  s.energy -= s.cfg.t1Cost;
  const d = s.cfg.tiers[0];
  s.cells.push({ id: nid(), col, row, kind: "immune", tier: 1, hp: d.hp, maxHp: d.hp, cd: 0, flash: 0 });
  s.events.push({ kind: "place", col, y: row });
  return true;
}

export function placeWall(s: DefenseState, col: number, row: number): boolean {
  if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return false;
  if (cellAt(s, col, row)) return false;
  if (s.energy < s.cfg.wallCost) { s.events.push({ kind: "nofunds" }); return false; }
  s.energy -= s.cfg.wallCost;
  s.cells.push({ id: nid(), col, row, kind: "wall", tier: 0, hp: s.cfg.wallHp, maxHp: s.cfg.wallHp, cd: 0, flash: 0 });
  s.events.push({ kind: "place", col, y: row });
  return true;
}

/** a 를 b 위에 놓았을 때: 같은 면역·같은 티어면 합체(승급), 빈칸이면 이동. 반환=성공 */
export function dropCell(s: DefenseState, a: Cell, col: number, row: number): "merge" | "move" | "no" {
  if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return "no";
  const target = cellAt(s, col, row);
  if (target && target.id === a.id) return "no";
  if (!target) { a.col = col; a.row = row; return "move"; }
  if (a.kind === "immune" && target.kind === "immune" && a.tier === target.tier && a.tier < s.cfg.tiers.length) {
    target.tier += 1;
    const d = s.cfg.tiers[target.tier - 1];
    target.maxHp = d.hp; target.hp = d.hp; target.cd = 0; target.flash = 0.3;
    s.cells = s.cells.filter((c) => c.id !== a.id);
    s.events.push({ kind: "merge", col, y: row });
    return "merge";
  }
  return "no";
}

export function step(s: DefenseState, dt: number): void {
  if (s.status !== "playing") return;
  dt = Math.min(dt, 0.05); // 안정성(탭 전환 후 큰 dt 방지)
  s.time += dt;

  // 스폰
  while (s.spawned < s.queue.length && s.queue[s.spawned].at <= s.time) {
    const sp = s.queue[s.spawned++];
    const d = s.cfg.enemies[sp.type];
    s.enemies.push({ id: nid(), type: sp.type, col: sp.col, y: -0.6, hp: d.hp, maxHp: d.hp, atkCd: 0, hit: 0 });
  }

  // 웨이브 전환/승리
  const doneSpawning = s.spawned >= s.queue.length;
  if (doneSpawning && s.enemies.length === 0) {
    if (s.wave + 1 < s.cfg.waves.length) {
      s.intermission += dt;
      if (s.intermission >= s.cfg.intermissionSec) { s.intermission = 0; loadWave(s, s.wave + 1); }
    } else {
      s.status = "won";
      return;
    }
  }

  // 적
  for (const e of s.enemies) {
    if (e.hit > 0) e.hit -= dt;
    const d = s.cfg.enemies[e.type];
    const blocker = s.cells.find((c) => c.col === e.col && e.y >= c.row - 0.5 && e.y <= c.row + 0.2);
    if (blocker) {
      e.atkCd -= dt;
      if (e.atkCd <= 0) { blocker.hp -= d.atk; blocker.flash = 0.2; e.atkCd = 1; }
    } else {
      e.y += d.speed * dt;
    }
    if (e.y >= ROWS) {
      s.coreHp -= d.atk;
      s.events.push({ kind: "hitcore", col: e.col });
      e.hp = 0; // 제거 표식
    }
  }

  // 세포 사격
  for (const c of s.cells) {
    if (c.flash > 0) c.flash -= dt;
    if (c.kind !== "immune") continue;
    c.cd -= dt;
    const d = s.cfg.tiers[c.tier - 1];
    if (c.cd <= 0) {
      // 같은 열, 세포 위쪽(작은 y) 사거리 내 가장 가까운(=가장 큰 y) 적
      let target: Enemy | undefined;
      for (const e of s.enemies) {
        if (e.col !== c.col || e.hp <= 0) continue;
        if (e.y <= c.row + 0.2 && e.y >= c.row - d.range) {
          if (!target || e.y > target.y) target = e;
        }
      }
      if (target) {
        s.projectiles.push({ id: nid(), col: c.col, y: c.row - 0.3, ty: target.y, dmg: d.atk, hue: d.hue });
        c.cd = 1 / d.rate;
      }
    }
  }

  // 투사체
  for (const p of s.projectiles) {
    p.y -= PROJ_SPEED * dt;
    if (p.y <= p.ty) {
      // 도착 지점 근처 같은 열 적에게 명중
      let best: Enemy | undefined; let bd = 0.6;
      for (const e of s.enemies) {
        if (e.col !== p.col || e.hp <= 0) continue;
        const dist = Math.abs(e.y - p.ty);
        if (dist < bd) { bd = dist; best = e; }
      }
      if (best) { best.hp -= p.dmg; best.hit = 0.12; }
      p.y = -99; // 제거 표식
    }
  }
  s.projectiles = s.projectiles.filter((p) => p.y > -50);

  // 사망 처리
  const alive: Enemy[] = [];
  for (const e of s.enemies) {
    if (e.hp <= 0) {
      const d = s.cfg.enemies[e.type];
      if (e.y < ROWS) { s.energy += d.bounty; s.kills++; s.events.push({ kind: "kill", col: e.col, y: e.y }); }
    } else alive.push(e);
  }
  s.enemies = alive;
  s.cells = s.cells.filter((c) => c.hp > 0);

  // 에너지 재생 / 패배
  s.energy += s.cfg.energyRegen * dt;
  if (s.coreHp <= 0) { s.coreHp = 0; s.status = "lost"; }
}
