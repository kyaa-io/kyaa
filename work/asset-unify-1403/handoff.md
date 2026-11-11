# ASSET-UNIFY-1403
- inventory.txt: apps/web TS/TSX/CSS의 경제 이미지와 Heart/Ticket/Coins/Stamp 아이콘 검색 전수 목록(변경 전 경로 포함). 좋아요·아바타·고유 패스포트 도장은 별도 의미라 보존.
- point-coin.png: imagegen 생성 투명 원본. WebP 256px 파생본 사용. 기존 파일 보존.
- RewardIcon 및 REWARD_ICON_SRC가 경제 아이콘 소유. 기존 분홍 3D heart/ticket/stamp 재사용.
- 헤더/랭킹/교환/지갑/프로필/행 목록 이미지 연결 변경. 지갑 게스트 분홍 코인 경로도 공통 경로 사용.
- 로컬 서버 실행 없음. 공용 3000 통합 후 390/1440 원본 대비 프레이밍·16px P 가독성 확인 필요. 운영 안내 캡처/배포는 통합 담당 범위.
- vitest 4 files / 74 tests passed.
- RewardIcon 전용 4 cases 추가 통과(총 78 tests). typecheck는 변경 파일 오류 없이 Apple/Google 기존 테스트 KeyLike→CryptoKey 타입 오류 6건으로 실패. 공유 node_modules 사용.
