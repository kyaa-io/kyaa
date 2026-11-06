# 연예인 이름 사전

팬페이지 개설 신청의 이름 자동완성(`/api/celebrities/suggest`)이 읽는 자료다. 없는 이름은 직접 입력할 수 있고, 고른 이름은 글자로만 신청에 저장된다.

## 출처와 라이선스 (2026-11-07 원문 확인)

| 출처 | 쓰는 것 | 라이선스 | 근거 |
|---|---|---|---|
| Wikidata | 항목의 라벨과 별칭, 직업·유형, 사이트 링크 수 | CC0 | https://www.wikidata.org/wiki/Wikidata:Licensing |
| MusicBrainz | 아티스트 이름과 별칭(핵심 자료) | CC0 | https://musicbrainz.org/doc/MusicBrainz_Database |

- MusicBrainz의 보조 자료(태그, 평점, 주석, 검색 색인, 파생 통계)는 CC BY-NC-SA 3.0이라 쓰지 않는다. 그래서 검색 API 대신 지역별 browse API로 받는다.
- 계정, 키, 유료 API가 필요 없다. 요청에는 서비스 주소를 적은 User-Agent만 보낸다. MusicBrainz는 1.1초에 한 번 호출한다.
- 표의 `license` 열은 `CC0-1.0`만 받는다.

## 실행

```
node scripts/celebrity-names/fetch.mjs <출력 폴더>
```

`names.ndjson`, `load.sql`, `summary.json`을 만든다. DB에는 쓰지 않는다. `load.sql`은 한 트랜잭션이고 같은 파일을 다시 돌리면 쓰는 행이 없다. 파일에서 빠진 행은 지운다. 적용 순서는 운영 대장을 따른다.

## 범위

한국 국적의 가수·배우·크리에이터, K-pop 장르의 사람과 그룹, 한국 음악 그룹, MusicBrainz 대한민국 지역 아티스트(사람과 그룹). 이름과 별칭, 분류, 인기 순서용 숫자만 넣는다. 생일이나 소개 같은 다른 개인 정보는 넣지 않는다.
