import { describe, expect, it } from "vitest";
import { classifyExternalRoomLink, externalRoomLinksInput } from "./external-room-link";

describe("방 링크 판별", () => {
  it.each([
    ["https://open.kakao.com/o/gAbCdEf", "kakao-openchat"],
    ["https://cafe.naver.com/kyaafans", "naver-cafe"],
    ["https://discord.gg/abcDEF", "discord"],
    ["https://discord.com/invite/abcDEF", "discord"],
    ["https://x.com/kyaa_official", "x"],
    ["https://twitter.com/kyaa_official", "x"],
    ["https://band.us/band/12345", "band"],
  ])("%s → %s", (url, kind) => {
    expect(classifyExternalRoomLink(url)).toMatchObject({ kind });
  });

  it.each([
    "http://open.kakao.com/o/abc",
    "javascript:alert(1)",
    "https://open.kakao.com.evil.com/o/abc",
    "https://evil.com/open.kakao.com",
    "https://user:pw@open.kakao.com/o/abc",
    "https://open.kakao.com:8443/o/abc",
    "https://discord.com/channels/1/2",
    "https://example.com",
    "open.kakao.com/o/abc",
    "https://open.kakao.com/o/ab c",
    "",
  ])("거절: %s", (url) => {
    expect(classifyExternalRoomLink(url)).toBeNull();
  });

  it("호스트 대소문자는 구분하지 않고 쿼리는 그대로 둔다", () => {
    expect(classifyExternalRoomLink("https://OPEN.kakao.com/o/abc?x=1")).toEqual({ kind: "kakao-openchat", url: "https://open.kakao.com/o/abc?x=1" });
  });
});

describe("방 링크 요청 본문", () => {
  it("클라이언트가 보낸 종류는 무시하고 서버가 정한다", () => {
    const parsed = externalRoomLinksInput.parse([{ url: "https://discord.gg/abc", kind: "band" }]);
    expect(parsed).toEqual([{ kind: "discord", url: "https://discord.gg/abc" }]);
  });
  it("4개·중복·허용 밖 한 줄은 전체를 거절한다", () => {
    expect(externalRoomLinksInput.safeParse(Array.from({ length: 4 }, (_, i) => ({ url: `https://band.us/band/${i}` }))).success).toBe(false);
    expect(externalRoomLinksInput.safeParse([{ url: "https://band.us/band/1" }, { url: "https://band.us/band/1" }]).success).toBe(false);
    expect(externalRoomLinksInput.safeParse([{ url: "https://band.us/band/1" }, { url: "https://evil.com" }]).success).toBe(false);
  });
  it("빈 배열은 허용한다", () => {
    expect(externalRoomLinksInput.parse([])).toEqual([]);
  });
});
