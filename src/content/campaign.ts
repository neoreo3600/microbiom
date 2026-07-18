// content/campaign.ts
// 숙주(사람) 캠페인 — 각 속나라 바깥의 실제 사람. 이야기의 심장.
// 보스(질병) 데이터에 이름·사연·회복 컷을 입혀 "이주 루프"의 단위로 만든다.
// 명명·사연은 전부 교체 가능한 데이터. (프레이밍: 치료 아님, 회복의 방향으로만 — §0)

import type { Boss } from "../engine/state";
import { DIABETES_T2, AUTOIMMUNE_RA, DEPRESSION, NAFLD, ANXIETY } from "./bosses";

export interface Host {
  id: string;
  name: string;
  age: number;
  bio: string; // 한 줄 사연
  boss: Boss;
  recoveryCut: string; // 항상성 복원 시 "바깥의 삶"이 회복되는 한 컷 (증상 전시 X, 회복 방향 O)
}

export const HOSTS: Host[] = [
  {
    id: "host_kim",
    name: "김성호",
    age: 54,
    bio: "야식으로 하루를 닫는 가장. 당뇨 5년차.",
    boss: DIABETES_T2,
    recoveryCut: "아침에 몸이 덜 무겁고, 계단이 덜 숨차고, 손발 저림이 준다.",
  },
  {
    id: "host_lee",
    name: "이지현",
    age: 34,
    bio: "아침마다 손이 뻣뻣해 아이를 안기 힘든 엄마.",
    boss: AUTOIMMUNE_RA,
    recoveryCut: "붓기가 가라앉고, 아침 강직이 풀려 다시 아이를 안는다.",
  },
  {
    id: "host_park",
    name: "박준영",
    age: 29,
    bio: "몇 달째 아침이 무겁고, 좋아하던 것에 흥미를 잃은 청년.",
    boss: DEPRESSION,
    recoveryCut: "색이 다시 보이고, 창을 열고, 친구의 연락에 답한다.",
  },
  {
    id: "host_choi",
    name: "최민재",
    age: 47,
    bio: "회식과 야근으로 간이 지쳐가는 직장인.",
    boss: NAFLD,
    recoveryCut: "몸이 가벼워지고, 오후의 피로가 줄고, 아침이 개운하다.",
  },
  {
    id: "host_yoon",
    name: "윤서연",
    age: 26,
    bio: "가슴이 자주 두근거리고, 사소한 일에도 긴장이 풀리지 않는.",
    boss: ANXIETY,
    recoveryCut: "숨이 한결 편해지고, 두근거림이 잦아들어 다시 밖으로 나선다.",
  },
];

export function hostAt(index: number): Host | undefined {
  return HOSTS[index];
}
