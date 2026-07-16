// game/art.ts
// 플랫 벡터 "생태화" 플레이스홀더 아트. 히어로 유닛(유익균) = 귀엽고 단정한 세포 마스코트.
// 규칙: (1) 외부 에셋 0 — 인라인 SVG라 Capacitor CSP 안전. (2) id로 결정론적 생성 →
//        렌더마다 동일. (3) 나중에 손으로 그린 SVG로 무손실 교체(unit.art 필드 우선).
//        (4) §0 — 균은 "적"이 아니라 몸을 돕는 생명. 밝고 존엄하게, 공포/의료 묘사 없음.
//
// 교체 방법: content/units.ts 의 유닛에 art:"<svg ...>...</svg>" 를 넣으면 그게 우선한다.
// 아무 것도 안 넣으면 이 파일이 오행 팔레트 기반 마스코트를 자동으로 그려 슬롯을 채운다.

import type { UnitDef } from "../engine/state";

// ── 결정론적 난수 (id 문자열 → 시드) ──────────────────────────
function hashStr(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── 생태 팔레트 (오행 정서의 절제된 색). hue(도) 목록에서 결정론적 선택 ──
const ECO_HUES = [130, 160, 185, 200, 90, 45, 30, 330, 280, 255];

function palette(hue: number) {
  return {
    light: `hsl(${hue} 62% 78%)`,
    base: `hsl(${hue} 52% 56%)`,
    deep: `hsl(${hue} 48% 34%)`,
    ink: `hsl(${hue} 45% 20%)`,
    glow: `hsl(${hue} 70% 62%)`,
  };
}

// 유기적 블롭 경로 (닫힌 부드러운 곡선)
function blobPath(cx: number, cy: number, r: number, n: number, jit: number, rnd: () => number): string {
  const pts: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const rr = r * (1 - jit + rnd() * jit * 2);
    pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
  }
  const mid = (i: number): [number, number] => [
    (pts[i][0] + pts[(i + 1) % n][0]) / 2,
    (pts[i][1] + pts[(i + 1) % n][1]) / 2,
  ];
  const f = (x: number) => x.toFixed(1);
  let d = `M ${f(mid(n - 1)[0])} ${f(mid(n - 1)[1])}`;
  for (let i = 0; i < n; i++) {
    const m = mid(i);
    d += ` Q ${f(pts[i][0])} ${f(pts[i][1])} ${f(m[0])} ${f(m[1])}`;
  }
  return d + " Z";
}

const RARITY_RANK: Record<UnitDef["rarity"], number> = {
  common: 0, rare: 1, epic: 2, legendary: 3,
};

/** 유닛 아바타 SVG 문자열. size = px. unit.art 가 있으면 그대로 사용(향후 교체용). */
export function unitAvatar(unit: UnitDef, size = 48): string {
  const custom = (unit as UnitDef & { art?: string }).art;
  if (custom) return custom;

  const seed = hashStr(unit.id);
  const rnd = mulberry32(seed);
  const rank = RARITY_RANK[unit.rarity];
  const hue = ECO_HUES[seed % ECO_HUES.length];
  const p = palette(hue);
  const uid = `u${(seed % 100000).toString(36)}`;

  const cx = 32, cy = 34;
  const bodyR = 19;
  const nPts = 6 + rank; // 희귀도↑ → 윤곽 디테일↑
  const jit = 0.14 + rnd() * 0.08;
  const body = blobPath(cx, cy, bodyR, nPts, jit, rnd);

  // 섬모(cilia): 희귀도별 개수. 몸을 살아있게.
  const ciliaN = [3, 4, 6, 8][rank];
  let cilia = "";
  for (let i = 0; i < ciliaN; i++) {
    const a = (i / ciliaN) * Math.PI * 2 + rnd() * 0.5;
    const x1 = cx + Math.cos(a) * (bodyR - 1);
    const y1 = cy + Math.sin(a) * (bodyR - 1);
    const x2 = cx + Math.cos(a) * (bodyR + 4);
    const y2 = cy + Math.sin(a) * (bodyR + 4);
    cilia += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${p.deep}" stroke-width="1.6" stroke-linecap="round" opacity="0.7"/>`;
  }

  // 내부 무늬(핵·소기관 점)
  let nucleus = "";
  const dots = 2 + rank;
  for (let i = 0; i < dots; i++) {
    const a = rnd() * Math.PI * 2;
    const rr = rnd() * (bodyR - 8);
    const dx = cx + Math.cos(a) * rr;
    const dy = cy + Math.sin(a) * rr + 2;
    nucleus += `<circle cx="${dx.toFixed(1)}" cy="${dy.toFixed(1)}" r="${(1.4 + rnd() * 1.2).toFixed(1)}" fill="${p.light}" opacity="0.55"/>`;
  }

  // 얼굴 — 항상 순하고 단정하게 (마스코트)
  const eyeY = cy - 1;
  const face = `
    <circle cx="${cx - 5.5}" cy="${eyeY}" r="2.4" fill="${p.ink}"/>
    <circle cx="${cx + 5.5}" cy="${eyeY}" r="2.4" fill="${p.ink}"/>
    <circle cx="${cx - 4.7}" cy="${eyeY - 0.9}" r="0.8" fill="#fff" opacity="0.9"/>
    <circle cx="${cx + 6.3}" cy="${eyeY - 0.9}" r="0.8" fill="#fff" opacity="0.9"/>
    <path d="M ${cx - 4} ${cy + 5} Q ${cx} ${cy + 8.5} ${cx + 4} ${cy + 5}" fill="none" stroke="${p.ink}" stroke-width="1.5" stroke-linecap="round"/>`;

  // 희귀도 오라: epic=은은한 링, legendary=금빛 후광+왕관 점
  let aura = "";
  if (rank >= 2) {
    aura += `<path d="${blobPath(cx, cy, bodyR + 5, nPts, jit, mulberry32(seed + 7))}" fill="none" stroke="${p.glow}" stroke-width="1.2" opacity="${rank === 3 ? 0.5 : 0.32}"/>`;
  }
  let crown = "";
  if (rank === 3) {
    // 금빛 후광 + 세 점 (왕관 은유 — 위엄)
    crown = `<g opacity="0.95">
      <circle cx="${cx}" cy="${cy - bodyR - 6}" r="1.9" fill="#fbbf24"/>
      <circle cx="${cx - 7}" cy="${cy - bodyR - 3}" r="1.5" fill="#fcd34d"/>
      <circle cx="${cx + 7}" cy="${cy - bodyR - 3}" r="1.5" fill="#fcd34d"/>
    </g>`;
  }

  return `<svg viewBox="0 0 64 64" width="${size}" height="${size}" role="img" aria-label="${unit.name}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="${uid}g" cx="38%" cy="32%" r="75%">
        <stop offset="0%" stop-color="${p.light}"/>
        <stop offset="70%" stop-color="${p.base}"/>
        <stop offset="100%" stop-color="${p.deep}"/>
      </radialGradient>
    </defs>
    ${aura}
    ${cilia}
    <path d="${body}" fill="url(#${uid}g)" stroke="${p.deep}" stroke-width="1.3"/>
    ${nucleus}
    ${face}
    ${crown}
  </svg>`;
}
