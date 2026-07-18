// defense/meta.ts
// 영구 성장(로그라이트 메타). 판을 넘어 유지되는 항체(antibody) 통화 + 영구 강화.
// localStorage 저장. 판 시작 시 createDefenseState 에 보너스로 주입된다.

export interface Meta { antibody: number; up: Record<string, number>; }
export interface MetaItem { id: string; name: string; desc: string; icon: string; base: number; step: number; max: number; }

const KEY = "soknara.def.meta.v1";

export function loadMeta(): Meta {
  try {
    const m = JSON.parse(localStorage.getItem(KEY) || "");
    if (m && typeof m.antibody === "number" && m.up) return m as Meta;
  } catch { /* noop */ }
  return { antibody: 0, up: {} };
}
export function saveMeta(m: Meta): void {
  try { localStorage.setItem(KEY, JSON.stringify(m)); } catch { /* noop */ }
}

export const META_SHOP: MetaItem[] = [
  { id: "energy", name: "영양 비축", desc: "시작 에너지 +20", icon: "⚡", base: 5, step: 4, max: 6 },
  { id: "core", name: "장벽 강화", desc: "거점 최대 HP +25", icon: "🛡", base: 5, step: 4, max: 8 },
  { id: "dmg", name: "선천 면역", desc: "세포 시작 공격 +15%", icon: "💥", base: 6, step: 5, max: 6 },
  { id: "regen", name: "대사 기반", desc: "에너지 재생 +2/s", icon: "🍚", base: 6, step: 5, max: 5 },
  { id: "marrow", name: "골수 보유", desc: "골수 이식 1단계 보유 시작", icon: "🦴", base: 12, step: 10, max: 3 },
  { id: "ip", name: "면역 기억", desc: "시작 면역포인트 +6", icon: "🧬", base: 5, step: 4, max: 6 },
];

export function metaCost(m: Meta, it: MetaItem): number { return it.base + (m.up[it.id] ?? 0) * it.step; }
export function metaMaxed(m: Meta, it: MetaItem): boolean { return (m.up[it.id] ?? 0) >= it.max; }
export function buyMeta(m: Meta, it: MetaItem): boolean {
  if (metaMaxed(m, it) || m.antibody < metaCost(m, it)) return false;
  m.antibody -= metaCost(m, it);
  m.up[it.id] = (m.up[it.id] ?? 0) + 1;
  saveMeta(m);
  return true;
}

export interface MetaBonus { energyStart: number; coreHp: number; dmgLv: number; regenLv: number; marrowLv: number; startIp: number; }
export function metaBonus(m: Meta): MetaBonus {
  const u = m.up;
  return {
    energyStart: (u.energy ?? 0) * 20,
    coreHp: (u.core ?? 0) * 25,
    dmgLv: u.dmg ?? 0,
    regenLv: u.regen ?? 0,
    marrowLv: u.marrow ?? 0,
    startIp: (u.ip ?? 0) * 6,
  };
}

/** 판 종료 시 획득 항체 = 클리어 웨이브·처치 기반 (+승리 보너스) */
export function runReward(wavesCleared: number, kills: number, won: boolean): number {
  return wavesCleared * 3 + Math.floor(kills / 5) + (won ? 20 : 0);
}
