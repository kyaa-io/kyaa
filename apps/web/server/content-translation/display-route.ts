import { createHash, createHmac } from "node:crypto";
import { shouldOfferTranslation } from "@/features/content-safety/domain/translation-eligibility";
import { z } from "zod";
import { APP_LOCALES, type AppLocale } from "@/i18n/locales";
import { AuthError } from "@/features/auth/domain/auth-errors";
import { boundedJson, CertificationBodyError, json } from "@/server/certification/certification-http";
import { normalizedClientIp } from "@/server/inquiries/fanmeeting-route";
import { requireSameAppOrigin } from "@/server/config/app-origin";

const textSchema = z.string().min(1).max(100_000).refine(text => !!text.trim());
const inputSchema = z.union([
  z.object({ text: textSchema, targetLocale: z.enum(APP_LOCALES) }).strict(),
  z.object({ texts: z.array(textSchema).min(1).max(128), targetLocale: z.enum(APP_LOCALES) }).strict(),
]).refine(value => ("text" in value ? [value.text] : value.texts).reduce((sum, text) => sum + Array.from(text).length, 0) <= 20_000);
const storedSchema = z.array(z.object({ sourceHash: z.string(), translatedText: z.string().min(1).max(100_000), detectedSourceLocale: z.string().nullable().optional() }));
/** Bump when the provider or its settings change: old cached translations then stop being used. */
export const TRANSLATOR_VERSION = "google-v2-nmt-1";
export function normalizeSourceText(text: string): string { return text.normalize("NFC").replace(/\r\n?/g, "\n").trim(); }
export function sourceHash(text: string): string { return createHash("sha256").update(normalizeSourceText(text)).digest("hex"); }
function sameLanguage(detected: string, locale: AppLocale): boolean {
  const base = (value: string) => value.toLowerCase().startsWith("zh") ? (/hant|tw|hk/i.test(value) ? "zh-hant" : "zh-hans") : value.toLowerCase().split("-")[0];
  return base(detected) === base(locale);
}
/** No provider call for emoji/number/URL-only text, text with fewer than 2 letters, or text already written in the target language. */
function prepareText(text: string, locale: AppLocale): { text: string; hash: string | null } {
  const normalized = normalizeSourceText(text);
  const letters = (normalized.replace(/https?:\/\/\S+|www\.\S+|@[\p{L}\p{N}_]+/giu, "").match(/\p{L}/gu) ?? []).length;
  return letters < 2 || !shouldOfferTranslation(normalized, locale) ? { text: normalized, hash: null } : { text: normalized, hash: sourceHash(normalized) };
}
const translatedTextsSchema = z.array(z.string().min(1).max(100_000)).min(1).max(128);

export type DisplayTranslationDependencies = {
  authorize(authorization: string | null): Promise<{ appUserId: string }>;
  rpc(name: string, args: Record<string, unknown>): Promise<unknown>;
  translate(texts: readonly string[], locale: AppLocale): Promise<Array<{ translatedText: string; detectedSourceLocale?: string }>>;
  secret: string; appOrigin: string; aws: boolean; vercel: boolean; localDevelopment: boolean;
  now?: () => Date;
};

/** Translates only the complete supplied text: this endpoint never looks up a client-selected resource or URL. */
export function createDisplayTranslationHandler(deps: DisplayTranslationDependencies) {
  return async (request: Request): Promise<Response> => {
    try {
      try { requireSameAppOrigin(request, new URL(deps.appOrigin).origin); }
      catch { return json({ error: { code: "TRANSLATION_INVALID_INPUT" } }, 400); }
      if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") {
        return json({ error: { code: "TRANSLATION_INVALID_INPUT" } }, 400);
      }
      if (deps.secret.length < 16 || (!deps.aws && !deps.vercel && !deps.localDevelopment)) {
        return json({ error: { code: "TRANSLATION_UNAVAILABLE" } }, 503);
      }
      const value = inputSchema.parse(await boundedJson(request, 96_000));
      const texts = "text" in value ? [value.text] : value.texts;
      // Invalid supplied credentials must never fall back to the public quota/cache identity.
      const owner = request.headers.has("authorization") ? (await deps.authorize(request.headers.get("authorization"))).appUserId : null;
      const identity = owner ? `user:${owner}`
        : `guest:${(deps.now?.() ?? new Date()).toISOString().slice(0, 10)}:${normalizedClientIp(request, deps.vercel, deps.aws)}`;
      const requesterHash = createHmac("sha256", deps.secret).update(`kyaa-display-translation-v1:${identity}`).digest("hex");
      const prepared = texts.map(text => prepareText(text, value.targetLocale));
      const checkAccount = async () => { if (owner) await deps.rpc("read_display_translation", { p_app_user_id: owner, p_requester_hash: requesterHash,
        p_source_hash: sourceHash(texts[0]), p_target_locale: value.targetLocale }); };
      const fallback = async () => { await checkAccount(); return json("text" in value ? { translatedText: texts[0], cached: false, fallback: true } : { translatedTexts: texts, cached: false, fallback: true }); };
      const pending = new Map<string, string>();
      prepared.forEach(item => { if (item.hash) pending.set(item.hash, item.text); });
      const resolved = new Map<string, string>();
      let providerCalled = false;
      if (pending.size) {
        try {
          const stored = storedSchema.parse(await deps.rpc("read_shared_translations", { p_source_hashes: [...pending.keys()], p_target_locale: value.targetLocale, p_translator_version: TRANSLATOR_VERSION }));
          for (const row of stored) { if (pending.has(row.sourceHash)) { resolved.set(row.sourceHash, row.translatedText); pending.delete(row.sourceHash); } }
          if (pending.size) {
            const missing = [...pending.entries()];
            const claimed = await deps.rpc("claim_shared_translation_requests", { p_source_hashes: missing.map(([hash]) => hash),
              p_target_locale: value.targetLocale, p_translator_version: TRANSLATOR_VERSION });
            if (claimed === false) return await fallback();
            const identity = owner ? `user:${owner}`
              : `guest:${(deps.now?.() ?? new Date()).toISOString().slice(0, 10)}:${normalizedClientIp(request, deps.vercel, deps.aws)}`;
            const requesterHash = createHmac("sha256", deps.secret).update(`kyaa-display-translation-v1:${identity}`).digest("hex");
            await deps.rpc("reserve_display_translation_request", { p_app_user_id: owner, p_requester_hash: requesterHash,
              p_character_count: missing.reduce((sum, [, text]) => sum + Array.from(text).length, 0) });
            providerCalled = true;
            // One provider request carries every uncached text of the page.
            const result = await deps.translate(missing.map(([, text]) => text), value.targetLocale);
            if (result.length !== missing.length) throw new Error("TRANSLATION_FAILED");
            const items = missing.map(([hash, text], index) => {
              const { translatedText, detectedSourceLocale } = result[index];
              // Provider says the text is already in the target language: keep the original and remember that, so it is never sent again.
              const same = !!detectedSourceLocale && sameLanguage(detectedSourceLocale, value.targetLocale);
              return { sourceHash: hash, translatedText: translatedTextsSchema.parse([same ? text : translatedText])[0], detectedSourceLocale: detectedSourceLocale ?? null };
            });
            await deps.rpc("save_shared_translations", { p_items: items, p_target_locale: value.targetLocale, p_translator_version: TRANSLATOR_VERSION });
            items.forEach(item => resolved.set(item.sourceHash, item.translatedText));
          }
        } catch {
          // Provider, quota or storage failure: show the original text. The client keeps this answer, so there is no retry storm.
          return await fallback();
        }
      }
      await checkAccount();
      const translatedTexts = prepared.map((item, index) => item.hash ? resolved.get(item.hash) ?? texts[index] : texts[index]);
      return json("text" in value ? { translatedText: translatedTexts[0], cached: !providerCalled } : { translatedTexts, cached: !providerCalled });
    } catch (error) {
      if (error instanceof AuthError) return json({ error: { code: "AUTHENTICATION_REQUIRED" } }, error.status);
      if (error instanceof CertificationBodyError) return json({ error: { code: "TRANSLATION_INVALID_INPUT" } }, error.code === "BODY_TOO_LARGE" ? 413 : 400);
      if (error instanceof z.ZodError || error instanceof SyntaxError) return json({ error: { code: "TRANSLATION_INVALID_INPUT" } }, 400);
      const code = error instanceof Error ? error.message : "";
      return json({ error: { code: code === "TRANSLATION_RATE_LIMITED" ? code : "TRANSLATION_UNAVAILABLE" } }, code === "TRANSLATION_RATE_LIMITED" ? 429 : 503);
    }
  };
}
