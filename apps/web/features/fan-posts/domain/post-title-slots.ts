/**
 * A board post has no title field: its title is the first line of its body. For translation the title and the article are two
 * slots, told apart by position and never by a line break in a translated text. A slot with nothing in it is left out, so a
 * post with only a title has one slot. The client and the server cut the same body with this one rule.
 */
export type PostTitleSlots = Readonly<{ title: string; article: string; hasTitle: boolean; hasArticle: boolean; texts: readonly string[] }>;

export function postTitleSlots(body: string): PostTitleSlots {
  const lines = body.split("\n");
  const title = lines[0]!, article = lines.slice(1).join("\n");
  const hasTitle = title.trim() !== "", hasArticle = article.trim() !== "";
  return { title, article, hasTitle, hasArticle, texts: [...(hasTitle ? [title] : []), ...(hasArticle ? [article] : [])] };
}

/**
 * What the shared cache keeps for a post translated by slots: the translated title on one line, a line break, the translated
 * article. That is the same shape as a translation of the whole body, so every other reader of the cache is unchanged.
 */
export function joinTranslatedSlots(translated: readonly string[], slots: PostTitleSlots): string {
  if (translated.length !== slots.texts.length) throw new Error("TRANSLATION_FAILED");
  const title = slots.hasTitle ? translated[0]!.replace(/\s*[\r\n]+\s*/g, " ").trim() : null;
  const article = slots.hasArticle ? translated[slots.hasTitle ? 1 : 0]! : null;
  if (title === "" || article?.trim() === "") throw new Error("TRANSLATION_FAILED");
  return [title, article].filter((part): part is string => part !== null).join("\n");
}

/** The slots of a cached text, or null when it cannot be cut with certainty (an older whole-body translation that lost its first line break). */
export function splitTranslatedSlots(stored: string, slots: PostTitleSlots): string[] | null {
  if (!slots.texts.length) return null;
  if (slots.texts.length === 1) return stored.trim() ? [stored] : null;
  const at = stored.indexOf("\n");
  if (at <= 0) return null;
  const title = stored.slice(0, at), article = stored.slice(at + 1);
  return title.trim() && article.trim() ? [title, article] : null;
}
