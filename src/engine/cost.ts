// engine/cost.ts
// CostCurve 평가 함수. n 은 "현재 보유/레벨" (즉 다음 1개를 살 때의 지수).
//   exp: base × ratio^n
//   lin: base + ratio × n
//   poly: base × n^ratio   (n=0 → base)

import Decimal from "break_infinity.js";
import type { CostCurve } from "./state";

export function computeCost(curve: CostCurve, n: number): Decimal {
  switch (curve.type) {
    case "exp":
      return curve.base.mul(curve.ratio.pow(n));
    case "lin":
      return curve.base.add(curve.ratio.mul(n));
    case "poly":
      // n=0 이면 0^ratio=0 이 되어버리므로 base 로 처리 (첫 구매 비용)
      return n <= 0 ? curve.base : curve.base.mul(new Decimal(n).pow(curve.ratio));
    default:
      return curve.base;
  }
}
