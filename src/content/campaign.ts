// content/campaign.ts
// 숙주(사람) 캠페인 — 각 속나라 바깥의 실제 사람. 이야기의 심장.
// 보스(질병) 데이터에 이름·사연·회복 컷을 입혀 "이주 루프"의 단위로 만든다.
// 명명·사연은 전부 교체 가능한 데이터. (프레이밍: 치료 아님, 회복의 방향으로만 — §0)

import type { Boss } from "../engine/state";
import { DIABETES_T2, AUTOIMMUNE_RA } from "./bosses";

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
];

export function hostAt(index: number): Host | undefined {
  return HOSTS[index];
}
