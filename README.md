# 《속나라》 — 방치형 치유 생태계 게임 · 엔진 코어 (P0)

한 사람의 몸속 생태계("속나라")를 재건해 회복시키고, 다음 사람에게로 **이주**하는 방치형 성장 게임의
데이터 주도 엔진 코어. 5개 프리미티브 성장엔진 위에 **4대 미터(숲·물길·온기·빛) + 염증/해독 +
뿌리노드(마이크로바이옴) + 오행 월드 + 보스(질병)** 도메인을 얹었다.

> **프레이밍(비협상):** 치료 시뮬레이션이 아니라 몸속 생태계를 정비·체험하는 판타지. 승리는 "완치"가
> 아니라 "생태계 균형(항상성) 회복"의 은유다. **실제 질병은 의료진의 진단·치료가 필요하며, 본 게임은
> 의학적 조언이 아니다.** 특정 질병이 게임/생활습관만으로 낫는다는 표현·의료 대체 서사·자해/위기 묘사 금지.

가장 중요한 원칙: **기능을 만들지 말고 프리미티브를 만든다.**
진화·업그레이드·유익균 뽑기·이주·부스터·오프라인·보스는 전부 아래 5개 프리미티브의 인스턴스이며,
신규 질병/보스는 **엔진 코드 변경 없이 config만 추가**해 표현된다.

## 실행

```bash
npm install
npm run dev        # 브라우저에 디버그 인스펙터가 뜬다 (Vite)
npm run typecheck  # 타입 검사
npm run build      # 타입검사 + 프로덕션 빌드
```

## 5개 프리미티브 (엔진의 전부)

| # | 프리미티브 | 정의 | 코드 |
|---|---|---|---|
| 1 | **Resource** | 누적되는 수량 (EP, genes …) | `Resource` |
| 2 | **Generator** | 시간당 Resource 를 생산하는 주체 (`rate = base × count × modifier`) | `Generator` |
| 3 | **Modifier** | 생산율/비용/오프라인보상에 `add`/`mult` 로 작용하는 **유일한 레버** (영구·임시·조건부) | `Modifier` |
| 4 | **CostCurve** | "다음 구매 비용" 함수 (`exp`/`lin`/`poly`) | `CostCurve` |
| 5 | **Prestige** | 진행 상태를 리셋하고, 진행도를 **영구 Modifier(통화)** 로 변환하는 전환기 | `PrestigeLayer` |

### 모든 "기능" 은 Modifier(거나 Modifier 를 낳는 전환)이다

| 게임 기능 | 실제 정체 | 구현 |
|---|---|---|
| 단계 진화 | Generator 의 tier 상승 | tier 증가 → 큰 `mult` modifier + 다음 tier 해금 |
| 업그레이드 | 구매형 Modifier | `mult`/`add` modifier 를 CostCurve 비용으로 구매 |
| 돌연변이(가챠) | 랜덤 영구 Modifier + 수집 플래그 | 확률 테이블에서 영구 modifier 획득, `collection` 에 flag |
| 환생(프레스티지) | 리셋 + 변환 | `resetScope` 초기화 후 진행도를 영구 modifier(통화)로 변환 |
| 광고 부스터 | 임시 Modifier | `expiresAt` 이 있는 `mult` modifier |
| 오프라인 보상 | rate × 경과시간 적분 | 상한(cap) 적용한 정산 |
| 광고 오프라인 ×N | 오프라인보상에 걸리는 Modifier | `scope="offlinePayout"` 의 `mult` |
| 도감 세트보너스 | 조건부 Modifier | `collection` count ≥ N 일 때 활성화되는 `condition` modifier |

→ 오른쪽 열은 전부 "Modifier" 거나 "Modifier 를 낳는 전환". **새 기능 = 새 config, not 새 코드.**

## 《속나라》 도메인 레이어 (P0)

### 4대 조작 미터 — 장수온심(腸水溫心)

플레이어가 매 순간 굴리는 다이얼. 각 미터는 0..1 이며 뿌리노드·염증·해독·되먹임 압력의 적분으로 움직인다.

| 미터 | 표면 | 내부 키 | 다스리는 것 |
|---|---|---|---|
| 숲(기르다) | 영양·미생물 | `gut` | 유익균·다양성·SCFA |
| 물길(흐르다) | 수·미네랄 | `water` | 순환·체액·전해질 |
| 온기(지피다) | 호르몬·체온 | `warmth` | 대사·효소·면역 (병에 따라 ↑/국소↓) |
| 빛(밝히다) | 마음·의식 | `mind` | 자율신경·파장. 부정→긍정 전환 |

보조 2: `inflammation`(오염, 크로스-빌런 — 대부분 보스가 이걸로 self-regen) · `detox`(해독 부담).

### 뿌리노드(마이크로바이옴)와 만류귀종 종속

- **뿌리노드**의 `diversity`(다양성)가 내구도=방어력. 4출력(면역·신경전달·SCFA·해독)을 전 미터에 배급.
- **종속 규칙(구현):** `boss.startMeters ∝ f(diversity)` — 뿌리가 튼튼할수록 보스가 **덜 무너진 채** 시작하고
  염증 regen 이 약해진다. → **"장부터"가 잔소리가 아니라 수학적으로 유리한 전략** (`engine/rootnode.ts`).
- **되먹임 고리:** 장-뇌축(장↓→세로토닌↓→빛↓), 빛↓→코르티솔↑→염증↑ (`engine/meters.ts`).
- 생태계 사슬: **뿌리노드 → 미터 → 생산** (미터 평균이 자원 생산율의 마지막 배수, `meterHealthMult`).

### 보스(질병) — 순환→정화→재생, 항상성 승리

보스는 미터 벡터 + 3페이즈 게이트 + 승리 밴드의 **데이터 한 블록**(`content/bosses.ts`). 승리는 "죽이기"가
아니라 **항상성 복원**(전 미터 ≥ 밴드 + 염증 낮음 + 질병 게이지 안정). 페이즈 게이트는 문자열
(`"warmth>=0.6 && water>=0.6"`)로 기술하고 엔진(`boss.evalGate`)이 직접 평가한다.

**4대 함정 아키타입** — 나머지 40+ 질병의 템플릿. 각기 다른 "틀리는 직관"과 시그니처 기믹을 가진다.

| 보스 | 아키타입 | 틀리는 직관 | 시그니처 기믹 |
|---|---|---|---|
| `diabetes_T2` (토·비위) | 과잉형 | "더 만들면 이긴다" | 혈당 게이지(fill) 굶기기 · 온기↑(보) · 인슐린저항 디버프 |
| `autoimmune_RA` (목·간담) | 공격형 | "때리면 이긴다" | 공격=자해(`attackRaisesGauge`) · 국소 온기↓(사·淸熱, `heatPolarity -1`) |
| `depression` (금·장-뇌축) | 강요형 | "긍정 강요하면" | **식(識) 잠금**(`mindLock`) — 지반(장·수·열+염증) 회복 전엔 빛 cap |
| `colon_cancer` (토·대장) | 은신형 | — | **연료·감시 종양**(`stealthGrow`) — 염증(연료)로 자라고 물길(NK감시)로만 억제, 배수 불가 |

- **허실 분기:** 당뇨는 온기↑(보), 자가면역은 온기↓(사·淸熱) — **같은 미터, 정반대 방향**을 `heatPolarity` 하나로.
- **식(識) 잠금:** 우울은 몸(지반)을 먼저 고쳐야 마음이 열림 → "그냥 긍정"이 규칙적으로 불가능.
- **은신형:** 암은 "죽이기"가 아니라 환경 교정(연료 차단+감시 유지)으로 **관해**(완치 단정 아님, §0/§8 민감).

**밸런스 스냅샷** (`npm run playthrough` — 올바른 순·정·재로 완주 시뮬, 회귀 가드):

| 보스 | 완주(iter) | 성격 |
|---|---|---|
| diabetes_T2 | 14 | 교육형 |
| depression | 14 | 식 잠금 게이팅 |
| colon_cancer | 37 | 은신형(지속 감시) |
| autoimmune_RA | 47 | 공격형(淸熱 후 회복, 최난) |

> naive "다 눌러" 플레이는 자가면역을 못 깬다(온기 과냉각) — 허실 분기가 실제로 작동한다는 증거.

### 보스/게이지 데이터 필드 레퍼런스

`Boss`(`content/bosses.ts`)의 튜닝 필드 — 전부 선택(optional), 엔진 코드 변경 없이 config로:

| 필드 | 뜻 |
|---|---|
| `gauge.behavior` | `fill`(차오름: 혈당·과활성·안개) · `drain`(빠짐) · `stealthGrow`(연료로 자라고 감시로 억제: 종양) |
| `gauge.fill` / `stableBand` / `start` | 초당 변화량 · 승리 안정 상한 · 시작 게이지값(암=이미 존재) |
| `heatPolarity` | 순환 시 온기 방향 `+1`(보) / `-1`(사·淸熱) — 허실 분기 |
| `attackRaisesGauge` | 공격(딜) 시 게이지 상승량 — 역설 보스(공격=자해) |
| `mindLock` | `{foundationMeters, foundationInflammation, cap}` — 지반 회복 전 빛(mind) 캡(우울) |
| `debuffs[]` | 시작 시 부여되는 디버프 modifier(인슐린저항 등) |
| `clearReward` | 승리 시 부여되는 영구 '치유 지혜' 배지(`heal:<id>`, 이주해도 유지) |
| `archetype` | 상속 태그(예: `cancer_base`) — `makeCancer()`로 템플릿 확장 |

그 밖의 데이터 계층: `content/campaign.ts`(숙주·이주 루프), `content/events.ts`(숙주 날씨), `content/worlds.ts`
(오행 6월드+오미 효과), `content/units.ts`(히어로 유닛 로스터). 상태에는 `meters`·`inflammation`·`detox`·
`tasteResources`·`rootnode`·`encounter`·`campaign`이 추가됐고 전부 세이브/로드 무손실이다.

### 구현된 게임 루프 (P0–M3)

- **성장·이주:** 5프리미티브 엔진 · 숙주 캠페인(클리어→이주→다음 숙주) · 승리 시 영구 '치유 지혜' 배지 · 리절트 카드
- **보스:** 4대 아키타입(당뇨·자가면역·우울·암) · 순·정·재 게이팅 · 항상성 승리 · `npm run playthrough` 밸런스 가드
- **생태계:** 미터4·염증·해독·뿌리노드 · 만류귀종 종속(뿌리 재건→하류 완화) · 되먹임 고리 실시간 시각화 · 트리맵
- **콘텐츠:** 오행 6월드 · 오미(五味) 자원 경제 · 히어로 유닛 로스터 · 숙주 날씨 이벤트
- **윤리:** §0 프레이밍 상시 디스클레이머 + 민감 보스(우울·암) 강조 배너
- **다음(M4, 결정 대기):** Unity 이식 vs 웹+Capacitor 하이브리드 → 리워드 광고 SDK

## 폴더 구조 (셋은 서로 독립)

```
src/
  engine/          // 순수 로직 (framework·content·debug 무관)
    state.ts       // GameState 타입 + 도메인 타입 + 잔액/미터 헬퍼
    modifiers.ts   // modifier 스택 → effective rate/cost/offline 계산 (+ 미터 건강도 결합)
    cost.ts        // CostCurve (exp/lin/poly)
    actions.ts     // 진화/구매/뽑기/부스터 (Modifier 를 만드는 액션)
    meters.ts      // 미터·염증·해독·게이지 연속 시뮬레이션 + 되먹임 고리
    rootnode.ts    // 뿌리노드 재건 + 만류귀종 종속 규칙 (startMeters/regen)
    boss.ts        // 인카운터 시작·페이즈 게이트 평가·항상성 승리 + 순·정·재 손길
    events.ts      // 숙주 이벤트(날씨) 적용 — 즉시 효과 + 임시 modifier
    taste.ts       // 오미(五味) 자원 축적/소비 (M2)
    tick.ts        // 틱 루프: 생산 누적 · 생태계 스텝 · 페이즈 평가 · 오미 축적 · 만료
    offline.ts     // 오프라인 적분 (cap 포함)
    prestige.ts    // 리셋 + 변환 (= 다음 사람에게 이주)
    save.ts        // 직렬화 / 역직렬화 / localStorage
  content/
    config.ts      // ★ 성장엔진 콘텐츠 (미터/뿌리노드 초기값·업그레이드·뽑기·이주 트리)
    bosses.ts      // ★ 보스(질병) 데이터 — 여기만 고치면 새 보스가 붙는다 (4대 아키타입)
    campaign.ts    // ★ 숙주(사람) 캠페인 — 이름·사연·회복 컷 + 이주 순서
    events.ts      // ★ 숙주 일상 이벤트(날씨) 데이터 — 야식·스트레스·수면…
    worlds.ts      // ★ 오행 6월드 + 오미(五味) 효과 데이터
    units.ts       // ★ 히어로 유닛(유익균·Treg 등) 로스터 (M2)
  debug/
    inspector.ts   // 미터·뿌리노드·보스전·미리보기·날씨·유닛·오미·리절트·트리맵·되먹임 대시보드
    format.ts      // 큰 수 포매터
  main.ts          // engine + content + inspector 조립
scripts/
  playthrough.ts   // `npm run playthrough` — 보스 완주 밸런스 회귀 가드
```

## 공통 공식 (계산 순서 고정)

**생산율 (초당)** — 순서: `base → additive(+) → multiplicative(×) → global mult`

```
generator rate = (baseRate × count + Σadd:generatorRate) × Πmult:generatorRate
resource total = (Σ generator rate + Σadd:globalRate) × Πmult:globalRate
```

이 순서를 완전히 결정론적으로 고정했기 때문에 **임시 부스터가 만료되면 생산율이 정확히 원복**된다.

- **비용:** `exp: base×ratio^n` · `lin: base+ratio×n` · `poly: base×n^ratio`, 이후 `cost` scope modifier 반영
- **오프라인:** `payout = min(elapsed, cap) × rate × offlinePayout mult`
- **환생 획득:** `floor(√(lifetimeEP / K))`
- 임시 modifier 는 매 틱 `expiresAt` 확인 후 만료 제거

## 큰 수

자원·비용은 전부 [break_infinity.js](https://github.com/Patashu/break_infinity.js) 의 `Decimal` 로 계산한다.
원시 `number` 로는 `1e100+` 를 다룰 수 없으므로(방치형에서 필연) 엔진 어디에서도 자원/비용에 `number` 를 쓰지 않는다.

## 저장

`GameState` 를 JSON 직렬화해 `localStorage` 에 저장한다.
- `Decimal` → 문자열, `Set` → 배열 로 변환해 **무손실** 복원.
- `condition` 함수는 직렬화 불가 → 저장 시 제외하고, 로드 시 `content/config.ts` 의 `CONDITIONS` 레지스트리에서 `modifier.id` 로 **재부착**.
- 업그레이드 레벨은 별도 저장하지 않고 `state.modifiers` 의 `source` 개수로 **파생**한다(환생/로드 후 자동 정합).
- `lastSeenAt` 타임스탬프로 오프라인 경과를 계산.

---

## config 만으로 콘텐츠 추가하기 (예시)

새로운 업그레이드 **"핵막(nucleus): globalRate ×4"** 를 추가한다고 하자.
**엔진 코드는 한 줄도 건드리지 않는다.** `src/content/config.ts` 의 `UPGRADES` 배열에 한 항목만 추가하면 끝이다.

```ts
// src/content/config.ts  →  UPGRADES 배열에 추가
{
  id: "nucleus",
  costResource: RESOURCE_IDS.EP,
  cost: { type: "exp", base: D(1e6), ratio: D(5) }, // 1e6 부터 ×5씩
  level: 0,
  maxLevel: 8,
  grants: { scope: "globalRate", target: "*", type: "mult", value: D(4) },
},
```

이것만으로:
- 인스펙터 "업그레이드" 패널에 `nucleus` 버튼과 다음 비용이 자동 표시되고,
- 구매하면 `grants` 템플릿이 `upgrade:nucleus#Lv` modifier 로 스택되어 생산율에 반영되며,
- 세이브/로드·환생 리셋(`resetScope` 의 `"upgrade:"`)에도 자동으로 올바르게 동작한다.

같은 방식으로 **새 tier / 돌연변이 / 프레스티지 영구 트리 / 부스터** 도 각 배열(`TIER`, `MUTATIONS`,
`PRESTIGE.permanentUpgrades`, `BOOSTERS`)에 데이터만 추가하면 된다.

### 새 보스(질병)도 config 한 블록 (engine 0줄)

`src/content/bosses.ts` 의 `BOSSES` 배열에 `Boss` 하나를 추가하면 인스펙터에 시작 버튼·미터 벡터·
페이즈 게이트·승리 판정이 전부 자동으로 붙는다. 게이트는 `gut/water/warmth/mind/inflammation/gauge/diversity`
식별자로 쓴 문자열이면 엔진이 그대로 평가한다.

```ts
export const NAFLD: Boss = {
  id: "nafld", disease: "지방간", world: "wood", organ: "간담",
  emotion: "분노", tasteResource: "sour",
  startMeters: { gut: 0.45, water: 0.4, warmth: 0.45, mind: 0.5 },
  detoxBurden: "high",
  inflammation: { value: 0.6, regen: 0.04 },
  gauge: { id: "간지방", behavior: "fill", drivers: ["과당"], overflow: "-allMeters", fill: 0.02, stableBand: 0.5 },
  heatPolarity: 1,
  phases: {
    circulation: { requires: "warmth>=0.55 && water>=0.55" },
    purification: { requires: "detox<=0.4 && inflammation<=0.4" },
    regeneration: { requires: "gut>=0.7 && mind>=0.6" },
  },
  victory: { band: "간지방안정", meters: 0.7, inflammationMax: 0.3 },
};
// BOSSES 배열에 NAFLD 추가 → 끝. 엔진 코드 변경 없음.
```

## 디버그 인스펙터

`npm run dev` → 브라우저. 예쁠 필요 없이 **밸런스 감 잡기** 만 목적.

- **실시간:** 미터4(숲·물길·온기·빛) 바 · 염증 · 해독 · 뿌리노드(다양성+4출력+하류난이도) · 보스 페이즈·게이지·게이트 상태 · 활성 modifier · 도감/이주
- **트리거:** [순환][정화][재생][공격/딜] 손길 · 보스 시작/이탈 · 진화·업그레이드·뽑기·이주 · 부스터·오프라인 ×N · 세이브/로드 · +시간 스킵
- **그래프:** 미터 평균(초록) + 염증(빨강) 추이 = 난이도 곡선
- **만류귀종 트리:** 뿌리→관문→질병 연쇄 + 되먹임 고리 표시

## 수용 기준 달성

### 성장엔진 코어 (Appendix)

| # | 기준 | 달성 |
|---|---|---|
| 1 | `content/config.ts` 만 고쳐 콘텐츠 추가 시 engine 변경 0줄 | config 배열 추가만으로 동작 |
| 2 | `1e100+` 정상 표시·계산 | 전 계산 `Decimal`, 포매터는 mantissa/exponent 표시 |
| 3 | +8h 스킵 → cap 적용 오프라인 보상 | `claimOffline` 이 `min(elapsed, cap)` 적용 |
| 4 | 임시 부스터 만료 시 생산율 정확 원복 | 계산 순서 고정 + `expiresAt` 만료 제거 |
| 5 | 이주 후 영구 modifier 로 재도달 가속 | `resetScope` 가 mutation/prestige/setBonus 보존 |
| 6 | 세이브→로드 무손실 | Decimal/Set 변환 + condition 재부착 + level 파생 |

### 《속나라》 P0 (핸드오프 §10)

| # | 기준 | 달성 |
|---|---|---|
| P0-1 | config만으로 신규 보스 추가 시 엔진 0줄 | `content/bosses.ts` 배열 추가만으로 (위 예시) |
| P0-2 | 큰 수 정상 · 세이브/로드 무손실 | 미터·염증·해독·뿌리노드·인카운터 전부 무손실 복원 |
| P1-1 | 뿌리 재건 시 하류 난이도↓ 수치 확인 | `computeStartMeters`/`adjustedInflammationRegen` — diversity↑ → startMeters↑·regen↓ |
| P1-2 | 순·정·재 페이즈 게이팅 작동 | `boss.evalGate` 문자열 게이트로 순환→정화→재생→항상성 승리 |
| — | 허실 분기(같은 미터 정반대) | `heatPolarity` — 당뇨 온기↑ / 자가면역 온기↓(淸熱) |

> 위 항목은 실제 엔진 코드를 esbuild 번들로 구동한 검증 하니스(32개 단언)와 Chromium 실 브라우저
> 구동(9개 체크: 패널 렌더·보스 시작·순정재 손길 반응·세이브/로드·콘솔 에러 0)으로 확인했다.

## 비목표 (구현하지 않음)

스토리·세계관·캐릭터·테마 / 아트·애니메이션·사운드·연출 / 실제 광고 SDK(버튼 스텁으로 대체) /
서버·계정·결제·네트워크 / 세련된 UI(디버그 계측 화면으로 충분).
