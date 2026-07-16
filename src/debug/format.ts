// debug/format.ts
// 큰 수 표시용 포매터. 1e100+ 도 안전하게 표시 (수용기준 2).

import Decimal from "break_infinity.js";

export function fmt(d: Decimal, smallDecimals = 2): string {
  if (d.eq(0)) return "0";
  const neg = d.lt(0);
  const a = d.abs();

  let out: string;
  if (a.lt(1000)) {
    out = trimZeros(a.toNumber().toFixed(smallDecimals));
  } else if (a.lt(1e6)) {
    out = Math.floor(a.toNumber()).toLocaleString("en-US");
  } else {
    // break_infinity: mantissa ∈ [1,10), exponent 정수
    const m = a.mantissa;
    const e = a.exponent;
    out = `${m.toFixed(2)}e${e}`;
  }
  return neg ? `-${out}` : out;
}

/** 초당 생산율 표시 */
export function fmtRate(d: Decimal): string {
  return `${fmt(d)}/s`;
}

/** 남은 시간(ms) → "12.3s" */
export function fmtRemain(expiresAt: number | undefined, now: number): string {
  if (expiresAt === undefined) return "∞";
  const r = Math.max(0, expiresAt - now) / 1000;
  return `${r.toFixed(1)}s`;
}

export function fmtDuration(sec: number): string {
  if (sec < 60) return `${sec.toFixed(0)}s`;
  if (sec < 3600) return `${(sec / 60).toFixed(1)}m`;
  return `${(sec / 3600).toFixed(2)}h`;
}

function trimZeros(s: string): string {
  return s.replace(/\.?0+$/, "");
}
