export function noticeMedia(src: unknown) {
  if (typeof src !== "string") return null;
  let url: URL;
  try { url = new URL(src, "https://kyaa.io"); } catch { return null; }
  if (url.protocol !== "https:" || url.username || url.password || url.port) return null;
  if (["kyaa.io", "dev.kyaa.io"].includes(url.hostname) && /^\/public-assets\/cms-assets\/[\w/-]+\.mp4$/i.test(url.pathname)) {
    return { kind: "mp4", src: url.pathname } as const;
  }
  let id: string | null | undefined;
  if (url.hostname === "youtu.be") {
    id = url.pathname.slice(1);
  } else if (["youtube.com", "www.youtube.com", "m.youtube.com", "www.youtube-nocookie.com"].includes(url.hostname)) {
    id = url.pathname === "/watch"
      ? url.searchParams.get("v")
      : /^\/(?:embed|shorts)\/([^/]+)$/.exec(url.pathname)?.[1];
  }
  return id && /^[\w-]{11}$/.test(id) ? { kind: "youtube", src: "https://www.youtube-nocookie.com/embed/" + id } as const : null;
}

export function noticePoster(src: unknown) {
  if (typeof src !== "string") return null;
  return /^(?:https:\/\/(?:dev\.)?kyaa\.io)?(\/public-assets\/cms-assets\/[\w/-]+\.(?:webp|png|jpe?g))$/i.exec(src)?.[1] ?? null;
}
