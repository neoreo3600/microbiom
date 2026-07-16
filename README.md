# Idle Growth Engine — 방치형 성장엔진 코어

스토리·세계관·캐릭터·아트·애니메이션·사운드·연출을 **전부 배제**하고,
오직 **"수치가 커지는 엔진"** 과 **"그 수치를 조작하는 요소"** 만 구현한 방치형(idle) 게임 코어.

가장 중요한 원칙: **기능을 만들지 말고 프리미티브를 만든다.**
진화 · 업그레이드 · 돌연변이 · 환생 · 광고 부스터 · 오프라인 보상은
전부 아래 5개 프리미티브의 인스턴스이며, 특수 케이스 코드 없이 **데이터(config)만으로** 표현된다.

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

## 폴더 구조 (셋은 서로 독립)

```
src/
  engine/          // 순수 로직 (framework·content·debug 무관)
    state.ts       // GameState 타입 + 잔액 헬퍼
    modifiers.ts   // modifier 스택 → effective rate/cost 계산
    cost.ts        // CostCurve (exp/lin/poly)
    actions.ts     // 진화/구매/뽑기/부스터 (Modifier 를 만드는 액션)
    tick.ts        // 틱 루프: 생산 누적 · 임시 modifier 만료 · unlock 평가
    offline.ts     // 오프라인 적분 (cap 포함)
    prestige.ts    // 리셋 + 변환
    save.ts        // 직렬화 / 역직렬화 / localStorage
  content/
    config.ts      // ★ 데이터 주도 콘텐츠 (여기만 고치면 콘텐츠 추가됨)
  debug/
    inspector.ts   // 숫자 대시보드 + 트리거 버튼 + EP 성장 그래프
    format.ts      // 큰 수 포매터
  main.ts          // engine + content + inspector 조립
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

## 디버그 인스펙터

`npm run dev` → 브라우저. 예쁠 필요 없이 **밸런스 감 잡기** 만 목적.

- **실시간:** 각 resource 값·초당 생산량, 활성 modifier 목록(source/scope/value/남은시간), prestige 상태, 도감 진행률
- **트리거 버튼:** 진화 · 업그레이드 · 돌연변이 뽑기 · 환생 · 부스터(광고 스텁) · 오프라인 ×N(스텁) · 세이브 · 로드 · +시간 스킵
- **그래프:** 시간에 따른 EP 성장 곡선(log10)

## 수용 기준 달성

| # | 기준 | 달성 |
|---|---|---|
| 1 | `content/config.ts` 만 고쳐 콘텐츠 추가 시 engine 변경 0줄 | 위 예시대로 config 배열 추가만으로 동작 |
| 2 | `1e100+` 정상 표시·계산 | 전 계산 `Decimal`, 포매터는 mantissa/exponent 표시 |
| 3 | +8h 스킵 → cap 적용 오프라인 보상 | `claimOffline` 이 `min(elapsed, cap)` 적용 |
| 4 | 임시 부스터 만료 시 생산율 정확 원복 | 계산 순서 고정 + `expiresAt` 만료 제거 |
| 5 | 환생 후 영구 modifier 로 재도달 가속 | `resetScope` 가 mutation/prestige/setBonus 는 보존 |
| 6 | 세이브→로드 무손실 | Decimal/Set 변환 + condition 재부착 + level 파생 |

## 비목표 (구현하지 않음)

스토리·세계관·캐릭터·테마 / 아트·애니메이션·사운드·연출 / 실제 광고 SDK(버튼 스텁으로 대체) /
서버·계정·결제·네트워크 / 세련된 UI(디버그 계측 화면으로 충분).
