// 261107-2 기능 계약 시험(단위): `npm run test:qc --workspace @byus/web`. 기본 vitest 실행에는 들어가지 않는다(파일 이름이 *.qc.tsx).
// 아직 없는 공통 컴포넌트(FanCollapsible·FanHeaderStatus)는 "미구현"으로 실패한다. 구현 묶음이 합쳐지면 초록이 되어야 한다.
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    include: ["q-contract/**/*.qc.{ts,tsx}"],
  },
  resolve: { alias: { "@": new URL("./", import.meta.url).pathname } },
});
