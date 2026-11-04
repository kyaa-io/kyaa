import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import sourceMessages from "./source-messages.json";

// DESIGN.md "화면 보조 문구" 규칙: 시스템·출처 설명, 제목을 풀어 쓴 문장, 섹션 소개는 새로 넣지 않는다.
// 글자 패턴만 검사하므로 새 표현의 우회는 잡지 못한다. 리뷰와 DESIGN.md 규칙이 함께 막아야 한다.
const bannedPatterns = [
  /별개예요/,
  /한\s?곳에서/,
  /한\s?곳에 모아/,
  /모아\s?보세요/,
  /에서 관리돼요/,
  /in one place/i,
  /\bseparate from\b/i,
  /are managed in/i,
];

// 판단 사실·조건·안내 페이지(가이드·FAQ)로 유지하기로 한 문구. 추가하려면 이유를 적는다.
const allowedKeys: Record<string, string> = {
  m5a82c094fbfb: "크리에이터 프로모션 소개(범위 밖)",
  mf5fabcca671f: "코드 입력 시간 조건(판단 사실)",
  mc6e113e028d1: "출석 코드 입력 시간·예약과 TikTok 이벤트 구분(조건)",
  mb77a3dfd2d64: "LIVE 예약과 선물 응모 구분(조건 FAQ)",
  m119f2bc8395b: "이벤트 참여 대상·배송 국가 조건",
  m1735acae1ea7: "인증 승인과 패스포트 발급 구분(상태 사실)",
};

describe("화면 보조 문구 재발 방지", () => {
  it("금지 패턴이 카탈로그 원문(ko·en)에 새로 들어오지 않는다", () => {
    const hits: string[] = [];
    for (const [key, entry] of Object.entries(sourceMessages as Record<string, Record<string, unknown>>)) {
      if (key in allowedKeys) continue;
      for (const locale of ["ko", "en"]) {
        const value = entry[locale];
        const text = typeof value === "string" ? value : typeof value === "object" && value ? String((value as { source?: unknown }).source ?? "") : "";
        if (bannedPatterns.some((pattern) => pattern.test(text))) hits.push(`${key}[${locale}] ${text.slice(0, 60)}`);
      }
    }
    expect(hits).toEqual([]);
  });

  // 카탈로그 밖 소스 문자열도 검사한다. 유지하는 문구는 파일과 정확한 문자열 단위로 적는다.
  const allowedStrings: Record<string, string[]> = {
    // 사업 안내 페이지의 서비스 카드(h3 제목 + 본문). 보조 문구가 아니라 페이지 본문 콘텐츠다(오케스트레이터 판단 2026-11-04).
    "components/business-inquiries/content.ts": ["Put your bio, channel links, and updates in one place so fans can find out what you’re doing next."],
    "components/ifew-fan-guide/content.ts": [
      "kyaa 예약과 TikTok 이벤트 등록은 별개예요.",
      "LIVE 예약과 선물 응모는 별개예요.",
      "A kyaa reservation is separate from TikTok event registration.",
    ],
    "components/elina-fan-guide/content.ts": ["Check-in is separate from reservation"],
    "features/certification/ui/certification-detail-screen.tsx": ["이번 인증 승인과 패스포트 발급은 별개예요. 팬 인증에서 발급 과정을 확인하세요."],
  };
  // 관리자 화면은 팬 UI가 아니므로 경로 전체를 검사에서 제외한다.
  const excludedPrefixes = ["components/admin/"];
  const findHits = (name: string, text: string) => {
    let rest = text;
    for (const phrase of allowedStrings[name] ?? []) rest = rest.split(phrase).join("");
    return bannedPatterns.filter((pattern) => pattern.test(rest));
  };
  const root = join(__dirname, "..");
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      if (name === "node_modules" || name === ".next") return [];
      if (statSync(path).isDirectory()) return walk(path);
      return /\.(tsx?|json)$/.test(name) && !/\.test\./.test(name) ? [path] : [];
    });

  it("소스 문자열에도 금지 패턴이 새로 들어오지 않는다", () => {
    const hits: string[] = [];
    for (const dir of ["app", "components", "features"]) {
      for (const file of walk(join(root, dir))) {
        const name = relative(root, file);
        if (excludedPrefixes.some((prefix) => name.startsWith(prefix))) continue;
        if (findHits(name, readFileSync(file, "utf8")).length) hits.push(name);
      }
    }
    expect(hits).toEqual([]);
  });

  it("면제 파일에 금지 패턴을 새로 넣으면 위반으로 잡힌다", () => {
    for (const [name, phrases] of Object.entries(allowedStrings)) {
      const original = readFileSync(join(root, name), "utf8");
      expect(findHits(name, original)).toEqual([]);
      expect(findHits(name, `${original}\n"이 영역은 별개예요."`).length).toBeGreaterThan(0);
      expect(findHits(name, `${original}\n"Shown in one place."`).length).toBeGreaterThan(0);
      expect(phrases.every((phrase) => original.includes(phrase))).toBe(true);
    }
  });
});
