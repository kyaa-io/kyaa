// 케미 기록(체인) 허용 목록의 원본. 설계 arch-chemi r3 §7.3 · 기획 11-9 표 A.
// SQL 검사 함수 public.chemi_chain_payload_check 는 이 파일에서 생성한다:
//   node scripts/chemi-chain-schema-sql.mjs            → supabase/migrations/20270110085000_chemi_chain_allow.sql 다시 씀
//   node scripts/chemi-chain-schema-sql.mjs --check    → 최신 allow migration 과 다르면 실패(chain_schema_drift)
// M1(W1-DB)이 만들고 M3 에 W1-CHAIN 으로 넘긴다. 넘긴 뒤 목록을 바꾸면 새 번호 allow migration 을 함께 낸다.
// 이 파일은 비밀이 아닌 순수 데이터라 생성 스크립트·worker 가 그대로 읽는다(그래서 "server-only" 를 붙이지 않는다).
//
// 올리지 않는 것: 생일(해시로도)·시간·별명·질문·궁합·친구와 오늘·결제·환불·이용권,
// 생일에서 나온 값(일주·띠·별자리·상승궁). 날짜는 그 기록의 한국 날짜·주차와 같은 값만 통과한다.

export const CHEMI_CHAIN_SCHEMA_VERSION = 1;

export type ChainValueRule =
  | { readonly t: "enum"; readonly v: readonly string[] }
  | { readonly t: "int"; readonly min: number; readonly max: number; readonly step?: number }
  | { readonly t: "intset"; readonly v: readonly number[] }
  | { readonly t: "date" } // = 그 기록의 kst_date
  | { readonly t: "week" } // = 그 기록의 kst_date 가 속한 주의 월요일
  | { readonly t: "hex64" } // sha256(salt ‖ 원문) — salt 는 DB 에만 있다
  | { readonly t: "intarray"; readonly len: number; readonly min: number; readonly max: number; readonly distinct: boolean };

export type ChainKindSchema = { readonly required: Readonly<Record<string, ChainValueRule>>; readonly optional?: Readonly<Record<string, ChainValueRule>> };

const CHARACTER = { t: "enum", v: ["changha", "elina", "yuna", "dosa"] } as const;
const DATE = { t: "date" } as const;
const WEEK = { t: "week" } as const;
const GAME = { t: "enum", v: ["run", "match"] } as const;
// 게임 맵은 최애 맵(08-3 '창하 맵')이다.
const MAP = { t: "enum", v: ["changha", "elina", "yuna", "dosa"] } as const;
const SCORE = { t: "int", min: 0, max: 10_000_000 } as const;
const TAROT_CARD = { t: "int", min: 0, max: 77 } as const; // 78장 덱
// 부적·카드·칭호·아이템 번호표는 에셋 장부(13-x)가 정한다. 그 전까지는 번호 범위로 막고, 장부가 오면 W1-CHAIN 이 intset 으로 좁힌다.
const CODE_NO = { t: "int", min: 1, max: 999 } as const;

export const CHEMI_CHAIN_SCHEMA: Readonly<Record<string, ChainKindSchema>> = {
  // 운세·별자리·타로 확인(최애별 하루 1번). 결과 구간은 10점 단위, 타로는 카드 번호.
  daily_reading: {
    required: { content: { t: "enum", v: ["fortune", "star", "tarot"] }, character: CHARACTER, date: DATE },
    optional: { band: { t: "int", min: 0, max: 90, step: 10 }, card: TAROT_CARD },
  },
  saju_first: { required: { character: CHARACTER, date: DATE, reading: { t: "int", min: 1, max: 9999 }, resultHash: { t: "hex64" } } },
  saju_topic: { required: { character: CHARACTER, date: DATE, topic: { t: "enum", v: ["daeun", "love", "money", "work", "health"] }, resultHash: { t: "hex64" } } },
  tarot3: { required: { character: CHARACTER, date: DATE, spread: { t: "int", min: 1, max: 9 }, topic: { t: "int", min: 1, max: 99 }, cards: { t: "intarray", len: 3, min: 0, max: 77, distinct: true } } },
  game_best: { required: { game: GAME, map: MAP, date: DATE, score: SCORE } },
  charm: { required: { charm: CODE_NO, character: CHARACTER, date: DATE } },
  card: { required: { card: CODE_NO, character: CHARACTER, date: DATE } },
  album: { required: { character: { t: "enum", v: ["changha", "elina", "yuna"] }, slot: { t: "int", min: 1, max: 6 }, stage: { t: "intset", v: [0, 5, 10, 15, 20, 30] } } },
  week5: { required: { week: WEEK, days: { t: "int", min: 5, max: 7 } } },
  box_item: { required: { week: WEEK, item: CODE_NO } },
  title: { required: { title: CODE_NO, date: DATE } },
  rank: { required: { week: WEEK, game: GAME, map: MAP, rank: { t: "int", min: 1, max: 1_000_000 }, score: SCORE } },
  rank_table: { required: { week: WEEK, game: GAME, map: MAP, root: { t: "hex64" } } },
};
