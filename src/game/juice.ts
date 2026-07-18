// game/juice.ts
// 게임 저스(juice): Web Audio 합성 SFX + 플로팅 텍스트 + 파티클 버스트 + 컨페티.
// 에셋 0 — 전부 코드로 합성/그림. Capacitor CSP 안전(외부 리소스 없음).
// 접근성: prefers-reduced-motion 이면 파티클/컨페티 생략(소리·플로팅은 최소 유지).

let muted = false;
try { muted = localStorage.getItem("soknara.muted") === "1"; } catch { /* noop */ }
const reduced = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

// ── Web Audio (지연 생성 + 첫 제스처에 resume) ──────────────────
let actx: AudioContext | null = null;
function ac(): AudioContext | null {
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    actx ??= new AC();
    if (actx.state === "suspended") void actx.resume();
    return actx;
  } catch { return null; }
}

function tone(freq: number, dur: number, type: OscillatorType, gain: number, slideTo?: number, delay = 0): void {
  if (muted) return;
  const c = ac(); if (!c) return;
  const t0 = c.currentTime + delay;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.03);
}

export const sfx = {
  circulate() { tone(460, 0.16, "triangle", 0.11, 660); },
  purify() { tone(680, 0.16, "sine", 0.1, 320); },
  regen() { tone(400, 0.16, "sine", 0.11, 540); tone(600, 0.14, "sine", 0.05, undefined, 0.05); },
  chime() { tone(720, 0.18, "sine", 0.1, 980); },
  blocked() { tone(150, 0.12, "square", 0.07); },
  phase() { [523, 659, 784].forEach((f, i) => tone(f, 0.16, "sine", 0.1, undefined, i * 0.07)); },
  win() { [523, 659, 784, 1046, 1318].forEach((f, i) => tone(f, 0.4, "sine", 0.1, undefined, i * 0.09)); },
};

export function isMuted(): boolean { return muted; }
export function toggleMuted(): boolean {
  muted = !muted;
  try { localStorage.setItem("soknara.muted", muted ? "1" : "0"); } catch { /* noop */ }
  if (!muted) sfx.chime();
  return muted;
}

// ── 비주얼 이펙트 레이어 (전체화면, pointer-events 없음) ──────────
function layer(): HTMLElement {
  let l = document.getElementById("g-fx");
  if (!l) {
    l = document.createElement("div");
    l.id = "g-fx";
    l.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:60;overflow:hidden";
    document.body.appendChild(l);
  }
  return l;
}

/** 위로 떠오르며 사라지는 텍스트 (탭 피드백) */
export function floatText(x: number, y: number, text: string, color: string): void {
  const s = document.createElement("div");
  s.textContent = text;
  s.style.cssText = `position:fixed;left:${x}px;top:${y}px;color:${color};font:700 14px 'Jua',sans-serif;white-space:nowrap;text-shadow:0 1px 4px rgba(0,0,0,.55)`;
  layer().appendChild(s);
  s.animate([
    { opacity: 0, transform: "translate(-50%,-40%) scale(.8)" },
    { opacity: 1, offset: 0.2, transform: "translate(-50%,-90%) scale(1.05)" },
    { opacity: 0, transform: "translate(-50%,-170%) scale(1)" },
  ], { duration: 950, easing: "cubic-bezier(.2,.7,.3,1)" }).onfinish = () => s.remove();
}

/** 탭 지점에서 튀는 파티클 */
export function burst(x: number, y: number, color: string, n = 9): void {
  if (reduced) return;
  const l = layer();
  for (let i = 0; i < n; i++) {
    const size = 5 + Math.random() * 5;
    const d = document.createElement("div");
    d.style.cssText = `position:fixed;left:${x}px;top:${y}px;width:${size}px;height:${size}px;margin:${-size / 2}px 0 0 ${-size / 2}px;border-radius:50%;background:${color};box-shadow:0 0 6px ${color}`;
    l.appendChild(d);
    const a = Math.random() * Math.PI * 2;
    const dist = 26 + Math.random() * 46;
    d.animate([
      { transform: "translate(0,0) scale(1)", opacity: 1 },
      { transform: `translate(${(Math.cos(a) * dist).toFixed(1)}px,${(Math.sin(a) * dist).toFixed(1)}px) scale(.2)`, opacity: 0 },
    ], { duration: 480 + Math.random() * 260, easing: "cubic-bezier(.2,.7,.3,1)" }).onfinish = () => d.remove();
  }
}

const CONFETTI_COLORS = ["#6fe0a6", "#6cc6f5", "#ffb27a", "#c9a2f7", "#ffd36b", "#ff8f9c"];
/** 승리 컨페티 */
export function confetti(n = 70): void {
  if (reduced) return;
  const l = layer();
  const W = window.innerWidth;
  const H = window.innerHeight;
  for (let i = 0; i < n; i++) {
    const size = 6 + Math.random() * 7;
    const p = document.createElement("div");
    const color = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
    p.style.cssText = `position:fixed;left:${(Math.random() * W).toFixed(0)}px;top:-20px;width:${size.toFixed(0)}px;height:${(size * 0.6).toFixed(0)}px;background:${color};border-radius:2px`;
    l.appendChild(p);
    const dx = (Math.random() - 0.5) * 160;
    const rot = (Math.random() - 0.5) * 720;
    p.animate([
      { transform: "translate(0,0) rotate(0deg)", opacity: 1 },
      { transform: `translate(${dx.toFixed(0)}px, ${H + 40}px) rotate(${rot.toFixed(0)}deg)`, opacity: 1, offset: 0.85 },
      { transform: `translate(${dx.toFixed(0)}px, ${H + 60}px) rotate(${rot.toFixed(0)}deg)`, opacity: 0 },
    ], { duration: 1600 + Math.random() * 900, easing: "cubic-bezier(.3,.6,.4,1)" }).onfinish = () => p.remove();
  }
}

/** 사운드 on/off 토글 버튼(좌상단). 1회만 생성. */
export function initSoundToggle(): void {
  if (document.getElementById("g-mute")) return;
  const b = document.createElement("button");
  b.id = "g-mute";
  b.textContent = muted ? "🔇" : "🔊";
  b.setAttribute("aria-label", "소리 켜기/끄기");
  b.style.cssText = "position:fixed;top:8px;left:8px;z-index:30;background:rgba(53,47,64,.85);color:#f5f0f7;border:none;border-radius:999px;width:34px;height:34px;font-size:15px;cursor:pointer;backdrop-filter:blur(6px)";
  b.addEventListener("click", () => { b.textContent = toggleMuted() ? "🔇" : "🔊"; });
  document.body.appendChild(b);
}
