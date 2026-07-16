// engine/save.ts
// 직렬화 / 역직렬화 / localStorage.
// Decimal → 문자열, Set → 배열 로 변환해 무손실 저장.
// condition 함수는 직렬화 불가 → 저장 시 제외, 로드 시 reattach 콜백으로 복원.

import Decimal from "break_infinity.js";
import type { GameState, Modifier, Resource, Generator } from "./state";

export const SAVE_KEY = "idle-growth-engine/save";

// ── Decimal 직렬화 헬퍼 ────────────────────────────────────────
function decToStr(d: Decimal): string {
  return d.toString();
}
function strToDec(v: unknown): Decimal {
  return new Decimal(typeof v === "string" || typeof v === "number" ? v : 0);
}
function decMap(m: Record<string, Decimal>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of Object.keys(m)) out[k] = decToStr(m[k]);
  return out;
}
function strMap(m: Record<string, unknown>): Record<string, Decimal> {
  const out: Record<string, Decimal> = {};
  for (const k of Object.keys(m ?? {})) out[k] = strToDec(m[k]);
  return out;
}

// ── 직렬화 ─────────────────────────────────────────────────────
export function serialize(s: GameState): string {
  const data = {
    v: 1,
    resources: Object.fromEntries(
      Object.values(s.resources).map((r) => [r.id, { id: r.id, amount: decToStr(r.amount) }])
    ),
    generators: Object.fromEntries(
      Object.values(s.generators).map((g) => [
        g.id,
        {
          id: g.id,
          produces: g.produces,
          baseRate: decToStr(g.baseRate),
          count: decToStr(g.count),
          tier: g.tier,
          maxTier: g.maxTier,
          unlocked: g.unlocked,
          unlockAt: g.unlockAt
            ? { resource: g.unlockAt.resource, amount: decToStr(g.unlockAt.amount) }
            : undefined,
        },
      ])
    ),
    modifiers: s.modifiers.map((m) => ({
      id: m.id,
      source: m.source,
      scope: m.scope,
      target: m.target,
      type: m.type,
      value: decToStr(m.value),
      expiresAt: m.expiresAt,
      // condition 은 저장하지 않는다 (로드 시 reattach)
    })),
    meters: s.meters,
    inflammation: s.inflammation,
    detox: s.detox,
    rootnode: s.rootnode,
    collection: Array.from(s.collection),
    prestige: {
      migrations: s.prestige.migrations,
      genes: decMap(s.prestige.genes),
    },
    lifetime: decMap(s.lifetime),
    lastSeenAt: s.lastSeenAt,
  };
  return JSON.stringify(data);
}

// ── 역직렬화 ───────────────────────────────────────────────────
// reattachConditions: 저장에서 잃은 condition 함수를 modifier.id 기준으로 되붙인다.
export function deserialize(
  json: string,
  reattachConditions?: (m: Modifier) => ((s: GameState) => boolean) | undefined
): GameState {
  const d = JSON.parse(json);

  const resources: Record<string, Resource> = {};
  for (const k of Object.keys(d.resources ?? {})) {
    resources[k] = { id: k, amount: strToDec(d.resources[k].amount) };
  }

  const generators: Record<string, Generator> = {};
  for (const k of Object.keys(d.generators ?? {})) {
    const g = d.generators[k];
    generators[k] = {
      id: g.id,
      produces: g.produces,
      baseRate: strToDec(g.baseRate),
      count: strToDec(g.count),
      tier: g.tier,
      maxTier: g.maxTier,
      unlocked: g.unlocked,
      unlockAt: g.unlockAt
        ? { resource: g.unlockAt.resource, amount: strToDec(g.unlockAt.amount) }
        : undefined,
    };
  }

  const modifiers: Modifier[] = (d.modifiers ?? []).map((m: any) => {
    const mod: Modifier = {
      id: m.id,
      source: m.source,
      scope: m.scope,
      target: m.target,
      type: m.type,
      value: strToDec(m.value),
      expiresAt: m.expiresAt,
    };
    if (reattachConditions) {
      const cond = reattachConditions(mod);
      if (cond) mod.condition = cond;
    }
    return mod;
  });

  const DEFAULT_METERS = { gut: 0.5, water: 0.5, warmth: 0.5, mind: 0.5 };
  const DEFAULT_ROOT = {
    diversity: 0.5,
    outputs: { immune: 0.5, neuro: 0.5, scfa: 0.5, detox: 0.5 },
  };

  return {
    resources,
    generators,
    modifiers,
    meters: { ...DEFAULT_METERS, ...(d.meters ?? {}) },
    inflammation: d.inflammation ?? 0,
    detox: d.detox ?? 0,
    rootnode: d.rootnode
      ? { diversity: d.rootnode.diversity ?? 0.5, outputs: { ...DEFAULT_ROOT.outputs, ...(d.rootnode.outputs ?? {}) } }
      : DEFAULT_ROOT,
    collection: new Set<string>(d.collection ?? []),
    prestige: {
      migrations: d.prestige?.migrations ?? d.prestige?.count ?? 0,
      genes: strMap(d.prestige?.genes ?? d.prestige?.currency ?? {}),
    },
    lifetime: strMap(d.lifetime ?? {}),
    lastSeenAt: d.lastSeenAt ?? Date.now(),
  };
}

// ── localStorage 래퍼 ──────────────────────────────────────────
export function saveToStorage(s: GameState): void {
  localStorage.setItem(SAVE_KEY, serialize(s));
}

export function loadFromStorage(
  reattachConditions?: (m: Modifier) => ((s: GameState) => boolean) | undefined
): GameState | null {
  const json = localStorage.getItem(SAVE_KEY);
  if (!json) return null;
  try {
    return deserialize(json, reattachConditions);
  } catch (e) {
    console.error("save load failed", e);
    return null;
  }
}

export function clearStorage(): void {
  localStorage.removeItem(SAVE_KEY);
}
