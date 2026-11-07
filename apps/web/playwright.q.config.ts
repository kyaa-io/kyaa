// 261107-2 실행 계약 시험(Playwright, 로컬 앱 기준): `npm run test:qe --workspace @byus/web`.
// 환경 변수
//   Q_BASE_URL   주소창에 쓰는 주소. 기본 http://localhost:3000 (로그인은 3000 에서만 된다)
//   Q_MAP_TO     연결만 다른 서버로 보낸다. 예 127.0.0.1:3840 (kyaa-t3 localdev-port <worktree> 3840)
//   Q_STATE      로그인 상태 파일. 예 ~/.kyaa-dev-test-accounts/dev-fan-3.local3000.json. 없거나 만료면 로그인 필요 시험은 건너뛴다고 출력한다.
//   Q_ALLOW_WRITE=1  로컬 DB 에 글·댓글을 쓰는 시험을 켠다(넣은 행은 시험이 출력한다).
// 웹 서버는 띄우지 않는다. 앱은 따로 띄운다.
import { defineConfig, devices } from "@playwright/test";

const baseURL = (process.env.Q_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const mapTo = process.env.Q_MAP_TO || "";

export default defineConfig({
  testDir: "./e2e-q",
  testMatch: "**/*.q.spec.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 120_000,
  reporter: [["list"], ["json", { outputFile: process.env.Q_REPORT || "test-results/q-report.json" }]],
  outputDir: "test-results/q",
  use: {
    baseURL,
    trace: "off",
    launchOptions: mapTo ? { args: [`--host-resolver-rules=MAP ${new URL(baseURL).host} ${mapTo}`] } : {},
  },
  projects: [
    { name: "chromium-390", use: { ...devices["Desktop Chrome"], viewport: { width: 390, height: 844 } } },
    { name: "chromium-1440", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 1024 } } },
  ],
});
