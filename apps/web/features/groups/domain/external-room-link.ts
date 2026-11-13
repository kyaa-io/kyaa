import { z } from "zod";

export const EXTERNAL_ROOM_KINDS = ["kakao-openchat", "naver-cafe", "discord", "x", "band"] as const;
export type ExternalRoomKind = (typeof EXTERNAL_ROOM_KINDS)[number];
export const EXTERNAL_ROOM_LINK_LIMIT = 3;

/** 서비스 종류는 주소의 호스트로만 정한다. 클라이언트가 보낸 종류는 믿지 않는다. */
const HOSTS: Readonly<Record<string, ExternalRoomKind>> = {
  "open.kakao.com": "kakao-openchat",
  "cafe.naver.com": "naver-cafe",
  "m.cafe.naver.com": "naver-cafe",
  "discord.gg": "discord",
  "discord.com": "discord",
  "x.com": "x",
  "www.x.com": "x",
  "twitter.com": "x",
  "www.twitter.com": "x",
  "band.us": "band",
  "www.band.us": "band",
};

export type ExternalRoomLink = Readonly<{ kind: ExternalRoomKind; url: string }>;

/** https 주소만, 계정·포트 없이, 허용한 호스트일 때만 `{ kind, url }`. 그 밖은 null. */
export function classifyExternalRoomLink(raw: string): ExternalRoomLink | null {
  const text = raw.trim();
  if (text.length < 9 || text.length > 2048 || /[\u0000- \u007f]/.test(text)) return null;
  let url: URL;
  try { url = new URL(text); } catch { return null; }
  if (url.protocol !== "https:" || url.username || url.password || url.port) return null;
  const host = url.hostname.toLowerCase();
  const kind = HOSTS[host];
  if (!kind) return null;
  if (host === "discord.com" && !url.pathname.startsWith("/invite/")) return null;
  return { kind, url: url.toString() };
}

/** 요청 본문: 최대 3개. 종류는 서버가 다시 정하고 같은 주소는 한 번만 둔다. 한 줄이라도 허용 밖이면 전체를 거절한다. */
export const externalRoomLinksInput = z
  .array(z.object({ url: z.string() }).transform((value, ctx): ExternalRoomLink => {
    const link = classifyExternalRoomLink(value.url);
    if (!link) { ctx.addIssue({ code: "custom", message: "unsupported room link" }); return z.NEVER; }
    return link;
  }))
  .max(EXTERNAL_ROOM_LINK_LIMIT)
  .refine((links) => new Set(links.map((link) => link.url)).size === links.length);

/** 읽기 쪽 계약. 옛 서버 응답에는 없을 수 있다. */
export const externalRoomLinksRead = z.array(z.object({ kind: z.enum(EXTERNAL_ROOM_KINDS), url: z.string() })).max(EXTERNAL_ROOM_LINK_LIMIT).optional();
