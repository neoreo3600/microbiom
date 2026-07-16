// platform/ads.ts
// 리워드 광고 추상화 레이어.
//   - 웹(브라우저/디버그): 스텁 — 즉시 보상 성공 (지금까지의 '광고 스텁' 동작 유지)
//   - 네이티브(Capacitor): @capacitor-community/admob 로 실제 리워드 광고
// 게임 로직은 이 인터페이스만 알면 되고, 플랫폼은 런타임에 자동 선택된다.

import { Capacitor } from "@capacitor/core";

/** 리워드 광고 지점 (§9 통합 지점) */
export type AdPlacement =
  | "offlineBoost" // 오프라인 보상 ×N
  | "booster" // 발효/성장 부스터
  | "gacha" // 유익균/유닛 뽑기
  | "crisis" // 위기 지원군
  | "meditation"; // 파장/명상 부스터

export interface RewardResult {
  rewarded: boolean;
  source: "stub" | "admob" | "failed";
}

export interface AdService {
  init(): Promise<void>;
  showRewarded(placement: AdPlacement): Promise<RewardResult>;
}

// Google 공식 테스트 리워드 광고 단위 ID (실제 배포 시 환경설정으로 교체).
const TEST_REWARDED_AD_ID = "ca-app-pub-3940256099942544/5224354917";

// ── 웹/디버그 스텁 ──────────────────────────────────────────────
const stubService: AdService = {
  async init() {
    /* no-op */
  },
  async showRewarded(placement) {
    console.log(`[ad:stub] rewarded (${placement}) → 즉시 보상`);
    return { rewarded: true, source: "stub" };
  },
};

// ── 네이티브 AdMob 어댑터 ───────────────────────────────────────
// 변수 지정자 + @vite-ignore: 웹 빌드는 이 패키지를 정적 분석/번들하지 않는다
// (네이티브 프로젝트에서 `npm i @capacitor-community/admob` 후에만 실제 로드).
async function loadAdMob(): Promise<any> {
  const pkg = "@capacitor-community/admob";
  const mod = await import(/* @vite-ignore */ pkg);
  return mod.AdMob;
}

function makeAdMobService(): AdService {
  let initialized = false;
  return {
    async init() {
      try {
        const AdMob = await loadAdMob();
        await AdMob.initialize({});
        initialized = true;
      } catch (e) {
        console.warn("[ad:admob] init 실패 — 스텁 폴백", e);
      }
    },
    async showRewarded(placement) {
      try {
        const AdMob = await loadAdMob();
        if (!initialized) {
          await AdMob.initialize({});
          initialized = true;
        }
        await AdMob.prepareRewardVideoAd({ adId: TEST_REWARDED_AD_ID });
        const reward = await AdMob.showRewardVideoAd();
        return { rewarded: !!reward, source: "admob" };
      } catch (e) {
        console.warn(`[ad:admob] show 실패 (${placement}) — 스텁 폴백`, e);
        return stubService.showRewarded(placement);
      }
    },
  };
}

// ── 플랫폼 자동 선택 ────────────────────────────────────────────
let cached: AdService | null = null;

export function getAdService(): AdService {
  if (cached) return cached;
  cached = Capacitor.isNativePlatform() ? makeAdMobService() : stubService;
  return cached;
}

/** 앱 시작 시 1회 호출 (네이티브에서 AdMob 초기화) */
export async function initAds(): Promise<void> {
  await getAdService().init();
}

/** 현재 플랫폼 라벨 (인스펙터 표시용) */
export function adPlatformLabel(): string {
  return Capacitor.isNativePlatform() ? `admob(${Capacitor.getPlatform()})` : "stub(web)";
}
