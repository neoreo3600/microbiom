// content/worlds.ts
// 오행 6월드 (무대 = 대상 오장육부). 핸드오프 §6 표를 데이터로 옮긴 것.
// 각 월드에 오행·장부·감정(빌런)·오미(회복 자원)·주관 조직이 붙는다.
// 엔진 변경 없이 여기에 월드만 추가/수정하면 된다.

import type { Element, World } from "../engine/state";
import type { TasteEffect } from "../engine/taste";

export const ELEMENT_LABEL: Record<Element, string> = {
  wood: "목(木)",
  fire: "화(火)",
  earth: "토(土)",
  metal: "금(金)",
  water5: "수(水)",
  ministerfire: "상화(相火)",
};

// 오미(회복 자원 타입) 표면 라벨
export const TASTE_LABEL: Record<string, string> = {
  sour: "신맛(酸)",
  bitter: "쓴맛(苦)",
  sweet: "단맛(甘)",
  pungent: "매운맛(辛)",
  salty: "짠맛(鹹)",
  none: "—",
};

export const WORLDS: World[] = [
  { id: "wood", element: "wood", organ: "간담", emotion: "분노", tasteResource: "sour", governedTissue: "근·힘줄·손톱·눈" },
  { id: "fire", element: "fire", organ: "심소장", emotion: "과한 기쁨", tasteResource: "bitter", governedTissue: "혈·혈관·혀·땀" },
  { id: "earth", element: "earth", organ: "비위", emotion: "사려·공상", tasteResource: "sweet", governedTissue: "기육·입술·사지" },
  { id: "metal", element: "metal", organ: "폐대장", emotion: "슬픔", tasteResource: "pungent", governedTissue: "피모·코" },
  { id: "water5", element: "water5", organ: "신방광", emotion: "공포", tasteResource: "salty", governedTissue: "뼈·골수·귀·머리털" },
  { id: "ministerfire", element: "ministerfire", organ: "심포삼초", emotion: "생명력 이상", tasteResource: "none", governedTissue: "신경·림프·체온조절" },
];

export function worldById(id: string | undefined): World | undefined {
  return WORLDS.find((w) => w.id === id);
}

export function tasteLabel(taste: string): string {
  return TASTE_LABEL[taste] ?? taste;
}

// 오미 사용 시의 회복 효과 (오미별 = 오행 치유 방향). 엔진 taste.spendTaste 가 적용.
export const TASTE_EFFECTS: Record<string, TasteEffect> = {
  sour: { inflammation: -0.12, detox: -0.1 }, // 신맛 — 간담 해독 2상
  bitter: { inflammation: -0.15 }, // 쓴맛 — 심 염증↓
  sweet: { meters: { warmth: 0.1, gut: 0.06 } }, // 단맛 — 비위 에너지(좋은 단맛)
  pungent: { meters: { water: 0.12 } }, // 매운맛 — 폐대장 발산·순환
  salty: { meters: { water: 0.1 }, detox: -0.05 }, // 짠맛 — 신방광 수분·전해질
  none: {}, // 상화 — 오미 없음
};

export function tasteEffect(taste: string): TasteEffect {
  return TASTE_EFFECTS[taste] ?? {};
}

// 오미 효과 한 줄 설명 (UI)
export const TASTE_EFFECT_DESC: Record<string, string> = {
  sour: "염증·해독 크게↓ (간담 해독)",
  bitter: "염증 크게↓ (심 청열)",
  sweet: "온기·숲↑ (비위 에너지)",
  pungent: "물길↑↑ (폐대장 발산)",
  salty: "물길↑·해독↓ (신방광 수분)",
  none: "—",
};
