import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import sourceMessages from "./source-messages.json";

// 2026-11-12 "보조 문구 전반 제거"(board/tasks/fb-1112/helper-copy-removed.md)로 화면에서 뺀 문장이다.
// 입력칸 아래·제목 아래·빈 상태·버튼 옆 설명은 다시 넣지 않는다. 입력 규칙은 위반했을 때 오류로만 알린다.
// 글자 패턴만 보므로 문장을 바꿔 쓴 우회는 잡지 못한다. 새 문구는 리뷰와 DESIGN.md "화면 보조 문구"가 막는다.
const removedPhrases = [
  "닉네임과 캐릭터",
  "닉네임과 아바타가 공개돼요",
  "Your nickname and character",
  "Your nickname and avatar are public",
  "응원의 한마디를 남겨 주세요",
  "새 소식과 LIVE가 공개되면 이곳에서",
  "새 소식이 올라오면 여기에서",
  "응모 일정은 공지에서 안내해요",
  "함께한 활동이 나의 등급이 돼요",
  "마음에 드는 선물을 고르고, 모은 응모권으로",
  "다른 팬들에게 표시되는 이름이에요",
  "원하는 언어로 1–32자까지",
  "받고 싶은 소식만 선택할 수 있어요",
  "카카오 계정에 등록된 번호로 서비스 알림을 보내드려요",
  "패스포트와 스탬프를 받는 계정이에요",
  "홈 화면에 kyaa를 추가하면 더 빠르게",
  "캐릭터를 고르거나 내 사진을 사용할 수 있어요",
  "캐릭터 또는 사진을 선택한 뒤 저장해 주세요",
  "사진을 드래그하거나 방향키로",
  "카카오톡을 사용하는 국내 휴대폰 번호를 등록해 주세요",
  "입력한 닉네임만 공개되며",
  "프로필을 완성하면 이전 화면으로",
  "팬 인증을 통과하면 {0} 패스포트",
  "간단한 퀴즈를 통과하면 첫 팬 인증 스탬프",
  "답변은 문항마다 안전하게 저장",
  "이미 시작한 인증이 있다면",
  "팬 인증하고 응모권을 받아 원하는 선물에 응모하세요",
  "응모권을 눌러 선택하거나 수량을 조절해요",
  "하루 한 번, 최애와 함께한 오늘을 스탬프로 남겨요",
  "내 코드를 친구에게 보내거나 친구의 코드를 입력하세요",
  "좋아하는 마음, 함께 나눠요",
  "얘기, 편하게 나눠요",
  "새 소식은 공지에서, 팬들과의 이야기는 라운지에서",
  "서로를 존중하며 이야기해요",
  "영문·숫자 4자 이상",
  "더 보기를 눌러 이 분류의 소식",
  "패스포트 스탬프함에서 첫 좋아요를 확인해 보세요",
  "내 패스포트는 MY에서 다시 볼 수 있어요",
  "한 가지를 선택해 주세요.",
  "해당하는 답변을 모두 선택해 주세요",
  "1점부터 5점까지 선택해 주세요",
  "kyaa에서 사용할 프로필과 알림을 관리하세요",
  "좋아하는 크리에이터의 팬페이지를 신청해요",
  "함께할 취미나 브랜드 페이지를 신청해요",
  "함께하는 팬이에요",
  "좋아요와 패스포트로 모인 팬들이에요",
  "활동한 팬 100명부터 공개 · 포인트 잔액과 팬 점수는 달라요",
];

// 닉네임·아바타가 공개된다는 안내는 어디에도 새로 두지 않는다. KYAA WAVE 체크인 이름 고지는
// 행사 참가자에게 이름이 보이는 개인정보 고지라 별도 파일(wave-privacy)에 남겼고 이 패턴에 걸리지 않는다.
const bannedPatterns = [/(닉네임|아바타|캐릭터)[^.\n]{0,12}공개(돼요|됩니다)/];

const root = join(__dirname, "..");
const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (name === "node_modules" || name === ".next") return [];
    if (statSync(path).isDirectory()) return walk(path);
    return /\.(tsx?|json)$/.test(name) && !/\.test\./.test(name) ? [path] : [];
  });

const sourceFiles = ["app", "components", "features", "i18n"]
  .flatMap((dir) => walk(join(root, dir)))
  .filter((file) => !relative(root, file).startsWith("components/admin/") && !relative(root, file).endsWith("source-messages.json"))
  .map((file) => ({ name: relative(root, file), text: readFileSync(file, "utf8") }));

const catalogTexts = Object.entries(sourceMessages as Record<string, Record<string, unknown>>).flatMap(([key, entry]) =>
  ["ko", "en"].map((locale) => ({ name: `${key}[${locale}]`, text: typeof entry[locale] === "string" ? (entry[locale] as string) : "" })));

describe("보조 문구 제거 재발 방지(2026-11-12)", () => {
  it("뺀 문장이 카탈로그 원문과 소스에 다시 들어오지 않는다", () => {
    const hits = [...catalogTexts, ...sourceFiles].flatMap(({ name, text }) =>
      removedPhrases.filter((phrase) => text.includes(phrase)).map((phrase) => `${name}: ${phrase}`));
    expect(hits).toEqual([]);
  });

  it("닉네임·아바타 공개 안내 패턴이 카탈로그와 소스에 없다", () => {
    const hits = [...catalogTexts, ...sourceFiles].flatMap(({ name, text }) =>
      bannedPatterns.filter((pattern) => pattern.test(text)).map((pattern) => `${name}: ${pattern}`));
    expect(hits).toEqual([]);
  });

  it("카탈로그에는 뺀 문장의 키가 남지 않는다", () => {
    const stale = Object.entries(sourceMessages as Record<string, { ko?: unknown }>)
      .filter(([, entry]) => typeof entry.ko === "string" && removedPhrases.some((phrase) => (entry.ko as string).includes(phrase)))
      .map(([key]) => key);
    expect(stale).toEqual([]);
  });
});
