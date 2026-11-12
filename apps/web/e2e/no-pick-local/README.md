# D–F 로컬 검증

실제 MyArtists, SelectedBiasChip, StanWallet, FanEntityCard와 제품 CSS를 사용한다.
로그인·가입 모임·최애 상태만 resources.ts/auth.ts에서 예시 데이터로 주입한다. 운영 DB에 연결하지 않는다.

저장소 루트에서:

```
node apps/web/e2e/no-pick-local/server.mjs
node apps/web/e2e/no-pick-local/run.mjs
```

기본 포트 5272. `?state=empty|loading|joined|guest|error&locale=ko`.
12개 언어 × 390/1440px에서 이미지 로드, 가로 넘침, 빈 별 슬롯 부재와 로딩/가입 상태를 검사한다.
한국어 캡처는 release-notes/images, 측정치는 work/no-pick-placeholder/browser-metrics.json에 쓴다.
