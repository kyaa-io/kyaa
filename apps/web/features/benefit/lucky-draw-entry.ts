// One decision for whether lucky-draw entries may be made. The screen (through the root layout) and the entry routes read this and nothing else.
// Only the development data environment takes entries; production and an unset value stay a preview (closed).
export function luckyDrawEntryPreview(env: Record<string, string | undefined>): boolean {
  return env.BYUS_DATA_ENVIRONMENT !== "development";
}

/** The routes that spend tickets call this first: a response means the preview is on and nothing may be written. */
export function luckyDrawPreviewRejection(env: Record<string, string | undefined> = process.env): Response | null {
  return luckyDrawEntryPreview(env)
    ? Response.json({ error: { code: "LUCKY_DRAW_PREVIEW" } }, { status: 403, headers: { "cache-control": "private, no-store" } })
    : null;
}
