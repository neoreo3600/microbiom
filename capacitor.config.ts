import type { CapacitorConfig } from "@capacitor/cli";

// Capacitor 셸 설정. webDir = Vite 빌드 출력(dist).
// 네이티브 앱은 이 dist 를 WebView 로 임베드한다.
const config: CapacitorConfig = {
  appId: "com.soknara.game",
  appName: "속나라",
  webDir: "dist",
  // 개발 중 실기기에서 dev 서버를 직접 보려면 아래 server.url 을 켠다 (배포 시엔 끈다).
  // server: { url: "http://192.168.0.x:5173", cleartext: true },
};

export default config;
