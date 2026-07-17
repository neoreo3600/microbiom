// game/art.ts
// 플랫 벡터 "생태화" 플레이스홀더 아트. 히어로 유닛(유익균) = 귀엽고 단정한 세포 마스코트.
// 규칙: (1) 외부 에셋 0 — 인라인 SVG라 Capacitor CSP 안전. (2) id로 결정론적 생성 →
//        렌더마다 동일. (3) 나중에 손으로 그린 SVG로 무손실 교체(unit.art 필드 우선).
//        (4) §0 — 균은 "적"이 아니라 몸을 돕는 생명. 밝고 존엄하게, 공포/의료 묘사 없음.
//
// 교체 방법: content/units.ts 의 유닛에 art:"<svg ...>...</svg>" 를 넣으면 그게 우선한다.
// 아무 것도 안 넣으면 이 파일이 오행 팔레트 기반 마스코트를 자동으로 그려 슬롯을 채운다.

import type { UnitDef, Element } from "../engine/state";

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

const RARITY_HUE_FALLBACK = ECO_HUES;

// 유닛별 캐릭터 디자인 — 실루엣·색·표정·소품을 의도적으로 배정(랜덤 아님).
type Shape = "round" | "capsule" | "peanut" | "teardrop";
type Eyes = "happy" | "calm" | "alert" | "sparkle";
type Acc = "leaf" | "spark" | "visor" | "halo" | "wave" | "swirl" | "crown" | "glowring" | "scarf" | "none";
interface Design { hue: number; shape: Shape; eyes: Eyes; acc: Acc; }

const UNIT_DESIGN: Record<string, Design> = {
  lacto: { hue: 145, shape: "capsule", eyes: "happy", acc: "leaf" },
  bifido: { hue: 122, shape: "peanut", eyes: "happy", acc: "leaf" },
  akker: { hue: 175, shape: "round", eyes: "happy", acc: "scarf" },
  butyrate: { hue: 40, shape: "round", eyes: "sparkle", acc: "spark" },
  nk: { hue: 8, shape: "round", eyes: "alert", acc: "visor" },
  treg: { hue: 205, shape: "round", eyes: "calm", acc: "halo" },
  psycho: { hue: 280, shape: "round", eyes: "sparkle", acc: "wave" },
  symbiont: { hue: 265, shape: "teardrop", eyes: "calm", acc: "swirl" },
  apex: { hue: 45, shape: "round", eyes: "sparkle", acc: "crown" },
  immortal: { hue: 190, shape: "round", eyes: "sparkle", acc: "glowring" },
};

const CX = 32, CY = 35;

function bodyShape(shape: Shape, fill: string, stroke: string, seed: number): string {
  switch (shape) {
    case "capsule":
      return `<rect x="20" y="15" width="24" height="39" rx="12" fill="${fill}" stroke="${stroke}" stroke-width="1.4"/>`;
    case "peanut":
      return `<path d="M18 34 a11 12 0 0 1 11 -12 a10 8 0 0 1 6 0 a11 12 0 0 1 11 12 a11 13 0 0 1 -11 13 a10 8 0 0 1 -6 0 a11 13 0 0 1 -11 -13 Z" fill="${fill}" stroke="${stroke}" stroke-width="1.4"/>`;
    case "teardrop":
      return `<path d="M32 15 C 47 24 46 46 32 53 C 18 46 17 24 32 15 Z" fill="${fill}" stroke="${stroke}" stroke-width="1.4"/>`;
    default:
      return `<path d="${blobPath(CX, CY, 19, 9, 0.05, mulberry32(seed))}" fill="${fill}" stroke="${stroke}" stroke-width="1.4"/>`;
  }
}

function eyeGroup(eyes: Eyes, ink: string): string {
  const lx = CX - 6.5, rx = CX + 6.5, ey = CY - 1;
  if (eyes === "calm") {
    return `<path d="M${lx - 3} ${ey} Q${lx} ${ey - 3.4} ${lx + 3} ${ey}" fill="none" stroke="${ink}" stroke-width="1.9" stroke-linecap="round"/>
      <path d="M${rx - 3} ${ey} Q${rx} ${ey - 3.4} ${rx + 3} ${ey}" fill="none" stroke="${ink}" stroke-width="1.9" stroke-linecap="round"/>`;
  }
  if (eyes === "alert") {
    return `<ellipse cx="${lx}" cy="${ey}" rx="2.6" ry="4.2" fill="${ink}"/><ellipse cx="${rx}" cy="${ey}" rx="2.6" ry="4.2" fill="${ink}"/>
      <circle cx="${lx + 1}" cy="${ey - 1.6}" r="1.1" fill="#fff"/><circle cx="${rx + 1}" cy="${ey - 1.6}" r="1.1" fill="#fff"/>
      <path d="M${lx - 3} ${ey - 5.5} l5 1.5" stroke="${ink}" stroke-width="1.3" stroke-linecap="round"/>
      <path d="M${rx + 3} ${ey - 5.5} l-5 1.5" stroke="${ink}" stroke-width="1.3" stroke-linecap="round"/>`;
  }
  // happy / sparkle — 큰 광택 눈
  const spark = eyes === "sparkle"
    ? `<circle cx="${lx - 1.6}" cy="${ey + 1.8}" r="0.8" fill="#fff" opacity=".85"/><circle cx="${rx - 1.6}" cy="${ey + 1.8}" r="0.8" fill="#fff" opacity=".85"/>`
    : "";
  return `<ellipse cx="${lx}" cy="${ey}" rx="3.3" ry="4.3" fill="${ink}"/><ellipse cx="${rx}" cy="${ey}" rx="3.3" ry="4.3" fill="${ink}"/>
    <circle cx="${lx + 1.2}" cy="${ey - 1.7}" r="1.4" fill="#fff"/><circle cx="${rx + 1.2}" cy="${ey - 1.7}" r="1.4" fill="#fff"/>${spark}`;
}

function accessory(acc: Acc, p: ReturnType<typeof palette>): string {
  switch (acc) {
    case "leaf":
      return `<g transform="translate(41 15) rotate(24)"><path d="M0 0 Q7 -4 9 4 Q2 7 0 0 Z" fill="hsl(130 55% 58%)" stroke="hsl(130 45% 40%)" stroke-width=".8"/><path d="M1 1 L7 3" stroke="hsl(130 45% 40%)" stroke-width=".7"/></g>`;
    case "spark":
      return `<path d="M33 9 l-5 8 h4 l-3 7 8 -10 h-4 l3 -5 z" fill="hsl(46 95% 62%)" stroke="hsl(38 80% 46%)" stroke-width=".8"/>`;
    case "visor":
      return `<path d="M20 27 q12 -6 24 0" fill="none" stroke="hsl(8 60% 46%)" stroke-width="3" stroke-linecap="round"/><circle cx="32" cy="24" r="1.6" fill="hsl(8 80% 60%)"/>`;
    case "halo":
      return `<ellipse cx="32" cy="13" rx="9" ry="2.6" fill="none" stroke="hsl(48 95% 72%)" stroke-width="1.8" opacity=".95"/>`;
    case "wave":
      return `<path d="M22 15 q3 -4 6 0 t6 0 t6 0" fill="none" stroke="hsl(280 70% 72%)" stroke-width="1.8" stroke-linecap="round"/>`;
    case "swirl":
      return `<path d="M32 12 a4 4 0 1 1 -3.5 4.2" fill="none" stroke="hsl(265 70% 74%)" stroke-width="1.8" stroke-linecap="round"/>`;
    case "crown":
      return `<path d="M22 15 l2.5 -6 3.5 4 4 -6.5 4 6.5 3.5 -4 2.5 6 z" fill="hsl(46 95% 62%)" stroke="hsl(38 80% 46%)" stroke-width="1" stroke-linejoin="round"/><circle cx="32" cy="7" r="1.3" fill="#fff2c2"/>`;
    case "scarf":
      return `<path d="M18 46 Q32 52 46 46 L46 50 Q32 56 18 50 Z" fill="hsl(175 55% 46%)" stroke="hsl(175 45% 34%)" stroke-width=".8"/>`;
    default:
      return "";
  }
}

/** 유닛 아바타 SVG — 캐릭터 디자인(음영·광택눈·볼터치·소품). unit.art 있으면 그대로. */
export function unitAvatar(unit: UnitDef, size = 48): string {
  const custom = (unit as UnitDef & { art?: string }).art;
  if (custom) return custom;

  const seed = hashStr(unit.id);
  const rank = RARITY_RANK[unit.rarity];
  const d: Design = UNIT_DESIGN[unit.id] ?? {
    hue: RARITY_HUE_FALLBACK[seed % RARITY_HUE_FALLBACK.length], shape: "round", eyes: "happy", acc: "none",
  };
  const p = palette(d.hue);
  const uid = `u${(seed % 100000).toString(36)}`;

  // 희귀도 오라(뒤): epic=링, legendary=이리데센트 후광+반짝이
  let aura = "";
  if (rank >= 2) {
    aura += `<circle cx="${CX}" cy="${CY}" r="23" fill="none" stroke="${p.glow}" stroke-width="1.4" opacity="${rank === 3 ? 0.55 : 0.32}"/>`;
  }
  if (rank === 3) {
    aura += `<g fill="#fff2c2">
      <path d="M12 16 l1 3 3 1 -3 1 -1 3 -1 -3 -3 -1 3 -1 z"/>
      <path d="M52 40 l.8 2.4 2.4 .8 -2.4 .8 -.8 2.4 -.8 -2.4 -2.4 -.8 2.4 -.8 z"/></g>`;
  }

  const eyes = eyeGroup(d.eyes, p.ink);
  const acc = accessory(d.acc, p);

  return `<svg viewBox="0 0 64 64" width="${size}" height="${size}" role="img" aria-label="${unit.name}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="${uid}g" cx="38%" cy="30%" r="80%">
        <stop offset="0%" stop-color="${p.light}"/>
        <stop offset="62%" stop-color="${p.base}"/>
        <stop offset="100%" stop-color="${p.deep}"/>
      </radialGradient>
    </defs>
    ${aura}
    <ellipse cx="${CX}" cy="57" rx="15" ry="3.2" fill="#000" opacity="0.18"/>
    ${bodyShape(d.shape, `url(#${uid}g)`, p.deep, seed)}
    <ellipse cx="${CX - 5}" cy="${CY - 6}" rx="8" ry="6" fill="${p.light}" opacity="0.4"/>
    <path d="M${CX - 11} ${CY - 9} Q${CX} ${CY - 17} ${CX + 12} ${CY - 8}" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round" opacity="0.35"/>
    <ellipse cx="${CX - 9}" cy="${CY + 4}" rx="2.6" ry="1.7" fill="#ff9db0" opacity="0.5"/>
    <ellipse cx="${CX + 9}" cy="${CY + 4}" rx="2.6" ry="1.7" fill="#ff9db0" opacity="0.5"/>
    ${eyes}
    <path d="M${CX - 3.5} ${CY + 6} Q${CX} ${CY + 9} ${CX + 3.5} ${CY + 6}" fill="none" stroke="${p.ink}" stroke-width="1.6" stroke-linecap="round"/>
    ${acc}
  </svg>`;
}

// ── 오행 6월드 배경 (보스전 무대) ────────────────────────────────
// 은유적 생태 풍경. 어두운 UI 위에서 은은하게 — 카드/텍스트 가독성을 해치지 않게 낮은 투명도.
// 각 오행에 팔레트 + 모티프(숲·불씨·대지·안개·물결·신경망). §0 — 공포/의료 묘사 없음.

const VB = { w: 400, h: 800 };

function glow(cx: number, cy: number, r: number, color: string, op: number): string {
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${color}" opacity="${op}"/>`;
}
// 하단을 채우는 물결/능선 띠
function ridge(y: number, amp: number, color: string, op: number): string {
  return `<path d="M0 ${y} C 110 ${y - amp}, 290 ${y + amp}, 400 ${y - amp * 0.6} L400 ${VB.h} L0 ${VB.h} Z" fill="${color}" opacity="${op}"/>`;
}
// 수평 안개/오라 띠
function band(y: number, h: number, color: string, op: number): string {
  return `<rect x="-20" y="${y}" width="440" height="${h}" rx="${h / 2}" fill="${color}" opacity="${op}"/>`;
}
function dots(seed: number, n: number, color: string, r: number, op: number, yTop: number, yBot: number): string {
  const rnd = mulberry32(seed);
  let out = "";
  for (let i = 0; i < n; i++) {
    const x = rnd() * VB.w;
    const y = yTop + rnd() * (yBot - yTop);
    out += `<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${(r * (0.6 + rnd() * 0.8)).toFixed(1)}" fill="${color}" opacity="${(op * (0.5 + rnd() * 0.5)).toFixed(2)}"/>`;
  }
  return out;
}

const SKY: Record<Element, [string, string]> = {
  wood: ["hsl(135 32% 13%)", "#0b0e13"],
  fire: ["hsl(16 40% 14%)", "#0b0e13"],
  earth: ["hsl(40 34% 13%)", "#0b0e13"],
  metal: ["hsl(200 14% 15%)", "#0b0e13"],
  water5: ["hsl(212 42% 13%)", "#0b0e13"],
  ministerfire: ["hsl(276 34% 14%)", "#0b0e13"],
};

function motif(el: Element): string {
  switch (el) {
    case "wood": // 숲 — 능선 + 나무 실루엣
      return (
        glow(80, 150, 150, "hsl(135 55% 40%)", 0.1) +
        ridge(560, 60, "hsl(135 42% 16%)", 0.9) +
        ridge(650, 40, "hsl(135 46% 12%)", 0.9) +
        `<g opacity="0.5" fill="hsl(135 40% 20%)">
           <ellipse cx="70" cy="540" rx="34" ry="46"/><rect x="66" y="560" width="8" height="40"/>
           <ellipse cx="330" cy="560" rx="26" ry="36"/><rect x="327" y="576" width="6" height="34"/>
         </g>` +
        dots(11, 14, "hsl(135 60% 55%)", 2.4, 0.5, 120, 560)
      );
    case "fire": // 불 — 따뜻한 화로 빛 + 피어오르는 불씨
      return (
        glow(200, 120, 200, "hsl(24 82% 48%)", 0.14) +
        glow(200, 120, 90, "hsl(38 90% 58%)", 0.12) +
        ridge(620, 44, "hsl(14 50% 18%)", 0.9) +
        dots(21, 26, "hsl(30 90% 60%)", 2.6, 0.6, 200, 640)
      );
    case "earth": // 흙 — 층층 대지 + 곡물 알갱이
      return (
        glow(300, 160, 150, "hsl(42 60% 46%)", 0.1) +
        ridge(520, 30, "hsl(38 40% 20%)", 0.85) +
        ridge(600, 26, "hsl(36 42% 16%)", 0.9) +
        ridge(680, 22, "hsl(34 44% 12%)", 0.92) +
        dots(31, 18, "hsl(44 70% 60%)", 2.2, 0.45, 300, 560)
      );
    case "metal": // 금 — 폐·호흡의 옅은 안개 띠
      return (
        glow(210, 140, 170, "hsl(200 20% 62%)", 0.08) +
        band(280, 34, "hsl(200 18% 66%)", 0.07) +
        band(360, 26, "hsl(200 16% 70%)", 0.06) +
        band(450, 30, "hsl(200 18% 60%)", 0.06) +
        dots(41, 10, "hsl(200 20% 80%)", 2, 0.3, 120, 520)
      );
    case "water5": // 수 — 깊은 물결 + 기포
      return (
        glow(200, 620, 220, "hsl(212 70% 44%)", 0.12) +
        ridge(520, 40, "hsl(212 50% 20%)", 0.85) +
        ridge(600, 34, "hsl(214 54% 16%)", 0.9) +
        ridge(680, 28, "hsl(216 58% 12%)", 0.92) +
        dots(51, 20, "hsl(200 80% 66%)", 2.6, 0.5, 300, 660)
      );
    case "ministerfire": // 상화 — 신경·림프의 오로라 망
      return (
        glow(140, 160, 160, "hsl(276 60% 50%)", 0.12) +
        glow(300, 320, 150, "hsl(250 60% 52%)", 0.1) +
        `<g fill="none" stroke="hsl(276 65% 62%)" stroke-width="1.4" opacity="0.28">
           <path d="M-10 300 C 120 240, 260 380, 420 300"/>
           <path d="M-10 380 C 130 460, 280 300, 420 400"/>
         </g>` +
        dots(61, 22, "hsl(280 75% 70%)", 2.2, 0.5, 120, 620)
      );
  }
}

// ── 보스 은유 형상 (질병 = 괴물이 아니라 '불균형') ────────────────
// §0 비협상: 공포·유혈·의료 묘사 없음. 추상 '불균형 문양(sigil)'. 얼굴/생물 아님.
//   민감 보스(우울·암·불안)엔 '꺼지지 않는 것'(빛·감시·고요한 중심)을 심어 희망 방향 고정.
//   각 문양은 실제 게이지 거동을 반영: 당뇨=차오름, 자가면역=자기표적, 우울=회색안개+빛,
//   암=조용한 엉킴+감시광, 지방간=쌓임, 불안=가라앉지 않는 물결.

const ELEMENT_HUE: Record<Element, number> = {
  wood: 135, fire: 16, earth: 40, metal: 200, water5: 212, ministerfire: 276,
};

// 100-box 파형 채움 (차오름 표현)
function waveFill(level: number, fill: string, op: number): string {
  return `<path d="M0 ${level} C 25 ${level - 6}, 55 ${level + 6}, 100 ${level - 4} L100 100 L0 100 Z" fill="${fill}" opacity="${op}"/>`;
}

function emblemInner(id: string, behavior: string | undefined, hue: number): string {
  const p = palette(hue);
  switch (id) {
    case "diabetes_T2": // 차오르는 혈당 — 넘치려는 단 물결 + 결정
      return (
        `<defs><linearGradient id="di_g" x1="0" y1="0" x2="0" y2="1">
           <stop offset="0%" stop-color="hsl(44 80% 62%)"/><stop offset="100%" stop-color="hsl(36 70% 42%)"/></linearGradient></defs>` +
        waveFill(50, "url(#di_g)", 0.85) + waveFill(56, "hsl(44 75% 55%)", 0.35) +
        `<g fill="hsl(46 85% 78%)" opacity="0.9">
           <rect x="35" y="30" width="7" height="7" transform="rotate(45 38.5 33.5)"/>
           <rect x="50" y="24" width="6" height="6" transform="rotate(45 53 27)"/>
           <rect x="62" y="32" width="7" height="7" transform="rotate(45 65.5 35.5)"/>
         </g>`
      );
    case "autoimmune_RA": // 아군 오사 — 안으로 향한 과열. 공격=자해
      return (
        glow(50, 50, 18, "hsl(6 80% 52%)", 0.35) +
        Array.from({ length: 7 }, (_, i) => {
          const a = (i / 7) * Math.PI * 2;
          const x1 = 50 + Math.cos(a) * 34, y1 = 50 + Math.sin(a) * 34;
          const x2 = 50 + Math.cos(a) * 17, y2 = 50 + Math.sin(a) * 17;
          return `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="hsl(10 78% 56%)" stroke-width="2.4" stroke-linecap="round"/>` +
            `<circle cx="${x2.toFixed(1)}" cy="${y2.toFixed(1)}" r="2" fill="hsl(14 85% 62%)"/>`;
        }).join("") +
        `<circle cx="50" cy="50" r="6" fill="hsl(12 85% 58%)"/>`
      );
    case "depression": { // 회색 안개가 색을 덮음 — 그러나 꺼지지 않는 빛(§0 희망)
      const fog = [30, 46, 62].map((y, i) =>
        `<rect x="-10" y="${y}" width="120" height="12" rx="6" fill="hsl(210 12% 72%)" opacity="${0.18 - i * 0.02}"/>`
      ).join("");
      return (
        glow(50, 52, 20, "hsl(42 90% 60%)", 0.45) +
        `<circle cx="50" cy="52" r="7" fill="hsl(46 95% 66%)"/>` + // 꺼지지 않는 작은 빛
        fog
      );
    }
    case "colon_cancer": // 조용한 엉킴(그림자) + 지켜보는 감시광(관해·감시유지)
      return (
        `<path d="M28 66 C 20 54, 40 50, 44 60 C 48 70, 64 68, 60 56 C 56 46, 74 48, 70 62"
           fill="none" stroke="hsl(240 8% 26%)" stroke-width="5" stroke-linecap="round" opacity="0.6"/>` +
        glow(68, 34, 16, "hsl(190 85% 72%)", 0.5) +
        `<circle cx="68" cy="34" r="4.5" fill="hsl(190 90% 82%)"/>` + // 감시의 빛
        Array.from({ length: 6 }, (_, i) => {
          const a = (i / 6) * Math.PI * 2;
          return `<line x1="68" y1="34" x2="${(68 + Math.cos(a) * 10).toFixed(1)}" y2="${(34 + Math.sin(a) * 10).toFixed(1)}" stroke="hsl(190 85% 78%)" stroke-width="1.3" opacity="0.6"/>`;
        }).join("")
      );
    case "nafld": // 쌓임·정체 — 무겁게 가라앉는 침전
      return (
        `<path d="M12 72 C 30 62, 40 74, 52 68 C 64 62, 78 74, 92 68 L92 92 L12 92 Z" fill="hsl(38 42% 40%)" opacity="0.8"/>` +
        `<path d="M12 80 C 32 72, 46 84, 60 78 C 74 72, 84 82, 92 78 L92 92 L12 92 Z" fill="hsl(34 45% 30%)" opacity="0.85"/>` +
        `<g fill="hsl(40 55% 52%)" opacity="0.85">
           <path d="M42 40 c 5 7 5 12 0 15 c -5 -3 -5 -8 0 -15"/>
           <path d="M60 48 c 4 6 4 10 0 12 c -4 -2 -4 -6 0 -12"/>
         </g>`
      );
    case "anxiety": { // 가라앉지 않는 물결(과각성) — 그러나 고요한 중심(§0 희망)
      const rings = [12, 20, 28, 35].map((r, i) =>
        `<circle cx="50" cy="${50 + (i % 2 === 0 ? -1 : 1) * 1.5}" r="${r}" fill="none" stroke="hsl(212 72% 62%)" stroke-width="${(2.2 - i * 0.3).toFixed(1)}" opacity="${(0.55 - i * 0.08).toFixed(2)}"/>`
      ).join("");
      return rings + `<circle cx="50" cy="50" r="4" fill="hsl(200 90% 82%)"/>`;
    }
    default: // 미지정 — 게이지 거동 기반 폴백
      if (behavior === "stealthGrow") return emblemInner("colon_cancer", behavior, hue);
      return waveFill(52, p.base, 0.6);
  }
}

/** 보스 은유 문양 SVG. 질병=불균형. element 팔레트의 링(돌보는 몸) 안에 불균형 패턴. */
export function bossEmblem(opts: { id: string; element?: Element; behavior?: string; size?: number }): string {
  const size = opts.size ?? 56;
  const hue = ELEMENT_HUE[opts.element ?? "earth"];
  const p = palette(hue);
  const cid = `ec_${opts.id}`;
  return `<svg viewBox="0 0 100 100" width="${size}" height="${size}" role="img" aria-label="${opts.id} 불균형 문양" xmlns="http://www.w3.org/2000/svg">
    <defs><clipPath id="${cid}"><circle cx="50" cy="50" r="38"/></clipPath></defs>
    <circle cx="50" cy="50" r="40" fill="${p.base}" opacity="0.08"/>
    <g clip-path="url(#${cid})">${emblemInner(opts.id, opts.behavior, hue)}</g>
    <circle cx="50" cy="50" r="40" fill="none" stroke="${p.base}" stroke-width="2.5" opacity="0.5"/>
  </svg>`;
}

/** 오행 월드 배경 SVG (보스전 무대). element 미지정 시 중립 배경. */
export function worldBackdrop(el: Element | undefined): string {
  const key: Element = el ?? "earth";
  const [top, base] = SKY[key];
  const gid = `sky_${key}`;
  return `<svg viewBox="0 0 ${VB.w} ${VB.h}" width="100%" height="100%" preserveAspectRatio="xMidYMin slice" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <defs>
      <linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${top}"/>
        <stop offset="60%" stop-color="${base}"/>
        <stop offset="100%" stop-color="${base}"/>
      </linearGradient>
    </defs>
    <rect x="0" y="0" width="${VB.w}" height="${VB.h}" fill="url(#${gid})"/>
    ${motif(key)}
  </svg>`;
}
