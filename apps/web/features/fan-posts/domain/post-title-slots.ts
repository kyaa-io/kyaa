export type PostSlot = "title" | "article";
export type PostSlotText = { slot: PostSlot; text: string };

/**
 * A board post's title is the first line of its body and the article is the rest. The slots are cut from the source text only, never from a
 * translation. The source is split at its first LF; a part that is not all whitespace is a slot (whitespace = what String.prototype.trim removes).
 * supabase `content_translation_expected_slots` is the same rule and decides what may be stored; post-title-slots.test.ts and
 * supabase/tests/content_translation_slots.sql (S1) hold the same case table.
 */
export function postTitleSlots(body: string): PostSlotText[] {
  const cut = body.indexOf("\n");
  const title = cut < 0 ? body : body.slice(0, cut), article = cut < 0 ? "" : body.slice(cut + 1);
  return [
    ...(title.trim() ? [{ slot: "title" as const, text: title }] : []),
    ...(article.trim() ? [{ slot: "article" as const, text: article }] : []),
  ];
}

/** [title, article] as the translation hook takes them: the text of each slot, "" for a slot the source does not have. */
export function postSlotTexts(body: string): readonly [string, string] {
  const slots = postTitleSlots(body);
  return [slots.find(item => item.slot === "title")?.text ?? "", slots.find(item => item.slot === "article")?.text ?? ""];
}
