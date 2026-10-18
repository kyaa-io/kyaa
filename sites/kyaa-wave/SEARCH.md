# KYAA WAVE 검색·공유 설정

2026-10-19 공식 자료 조사에 따라 구현. 검색 노출·순위·AI 인용은 각 서비스가 결정하며 등록/제출 성공과 구분한다.

| 항목 | 적용 |
| --- | --- |
| 수집 | JavaScript 없이 내용·제목·설명·링크가 완성된 한국어 `/`, 영어 `/en/` HTML |
| 언어/중복 URL | 각 언어 self-canonical, 상호 ko/en/x-default hreflang, 실제 링크 이동, 기존 lang 쿼리 HTTP 리다이렉트 |
| 사이트맵 | 최종 HTTPS canonical 두 URL만 sitemap.xml에 포함; robots.txt에 위치 제공 |
| SEO/GEO/AEO | 실제 텍스트와 일치하는 WebSite/Organization/WebPage JSON-LD, 명확한 소개·참여 방법·연락처·행사 마감 상태. 허위 후기/평점/회원 수 없음 |
| 공유 | 언어별 OG/Twitter 제목·설명·URL·locale·alt, 1200×630 JPEG 전용 이미지, PNG/ICO/Apple 아이콘 |
| 크롤러 | robots.txt의 전체 허용은 Googlebot, Bingbot, Yeti, OAI-SearchBot에도 적용. 기존 AI 학습 크롤러 정책은 변경하지 않음 |
| 알림 | public/의 IndexNow 공개 검증 파일; 실제 내용이나 URL 변경 배포 뒤 변경 URL만 제출 |

## 공식 근거와 적용 판단

- [Google AI 검색](https://developers.google.com/search/docs/appearance/ai-features): 검색 색인·스니펫 자격과 기본 SEO가 전제. AI 전용 스키마/텍스트 파일은 불필요. llms.txt를 효과가 입증된 요구사항으로 취급하지 않는다.
- [Google 다국어](https://developers.google.com/search/docs/specialty/international/localized-versions): 별도 언어 URL과 상호 hreflang을 제공한다. 언어를 브라우저 저장값으로만 바꾸지 않는다.
- [Google 사이트맵](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap): 검색에 노출할 canonical URL만 포함한다. 매 빌드 날짜로 lastmod를 부풀리지 않는다.
- [네이버 등록·소유확인](https://searchadvisor.naver.com/guide/faq-start-register), [기본 SEO](https://searchadvisor.naver.com/guide/seo-basic-intro): 초기 HTML에서 소유확인하고 실제 텍스트·사이트맵으로 수집을 지원한다. 게시글 피드가 없는 현재 랜딩에는 임의 RSS를 만들지 않는다(문서의 최신글 RSS 대상에서 판단).
- [Bing 가이드](https://www.bing.com/webmasters/help/webmaster-guidelines-30fba23a), [사이트맵](https://www.bing.com/webmasters/help/sitemaps-3b5cf6ed), [IndexNow 규약](https://www.indexnow.org/documentation): 사이트 소유확인과 사이트맵 제출, 배포 후 변경 URL 알림. IndexNow 200/202는 수신 상태이며 색인 보장이 아니다.
- [OpenAI 크롤러](https://developers.openai.com/api/docs/bots): 검색용 OAI-SearchBot과 학습용 GPTBot은 독립적이다.
- [OG 규약](https://ogp.me/): canonical URL과 이미지·제목·타입 및 이미지 크기·대체 설명을 초기 head에 제공한다.
- [Google FAQ 제한](https://developers.google.com/search/blog/2023/08/howto-faq-changes): 이 커뮤니티를 정부·보건 사이트용 FAQ 리치 결과 대상으로 꾸미지 않는다. 비공개/신청 마감 행사에 구매 가능 offers나 실제 장소를 찍은 것처럼 AI 이미지를 붙인 Event 리치 마크업을 만들지 않는다.

## 운영

`npm test`가 빌드 결과의 정적 언어 콘텐츠·메타·구조화 데이터·사이트맵·리다이렉트를 검사한다. `npm run build` 결과인 dist를 확인해야 한다. 원본 index.html은 공통 레이아웃 템플릿이며 완성된 head는 search.mjs가 생성한다. public/에는 검색 서비스가 발급한 **공개 소유확인 자료만** 둔다. 인증 토큰·API 비밀 키를 넣지 않는다.

IndexNow는 public/*.txt의 파일명과 본문이 같은 공개 키를 사용한다. 배포 성공과 키 파일 HTTP200을 확인한 뒤 https://api.indexnow.org/IndexNow 에 host, key, keyLocation, urlList를 POST한다. URL 두 개만 관리하는 사이트에 별도 스케줄러나 의존성을 추가하지 않았다. 검색 콘솔의 실제 등록·제출 증거와 상태는 작업 검증 기록에 남긴다.

2026-10-19 후속: 대표 연락처 biz@kyaa.io, 실제 문의 API/익명 유입·접수 집계, 공식 Telegram 연결과 kyaa.io 푸터 연결, 행사 종료 후 지난 모임 전환을 추가했다. 수신자·본문은 검색용 마크업/분석 이벤트에 싣지 않는다.
