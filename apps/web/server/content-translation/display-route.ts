import { createHash, createHmac } from "node:crypto";
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
const cachedSchema = z.object({ translatedText: z.string().min(1).max(100_000), cached: z.boolean() }).strict();
const translatedTextsSchema = z.array(z.string().min(1).max(100_000)).min(1).max(128);

export type DisplayTranslationDependencies = {
  authorize(authorization: string | null): Promise<{ appUserId: string }>;
  rpc(name: string, args: Record<string, unknown>): Promise<unknown>;
  translate(texts: readonly string[], locale: AppLocale): Promise<Array<{ translatedText: string }>>;
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
      const args = { p_app_user_id: owner, p_requester_hash: requesterHash,
        p_source_hash: createHash("sha256").update(JSON.stringify(texts)).digest("hex"), p_target_locale: value.targetLocale };
      const response = (raw: unknown, cached: boolean) => {
        const item = cachedSchema.parse(raw);
        const translatedTexts = translatedTextsSchema.parse(JSON.parse(item.translatedText));
        if (translatedTexts.length !== texts.length) throw new Error("TRANSLATION_FAILED");
        return json("text" in value ? { translatedText: translatedTexts[0], cached } : { translatedTexts, cached });
      };
      const cached = await deps.rpc("read_display_translation", args);
      if (cached !== null) return response(cached, true);
      await deps.rpc("reserve_display_translation_request", { p_app_user_id: owner, p_requester_hash: requesterHash,
        p_character_count: texts.reduce((sum, text) => sum + Array.from(text).length, 0) });
      const result = await deps.translate(texts, value.targetLocale);
      const translatedTexts = translatedTextsSchema.parse(result.map(item => item.translatedText));
      if (translatedTexts.length !== texts.length) throw new Error("TRANSLATION_FAILED");
      await deps.rpc("save_display_translation", { ...args, p_translated_text: JSON.stringify(translatedTexts) });
      // The save and read also reject disabled/deleted accounts after provider latency.
      return response(await deps.rpc("read_display_translation", args), false);
    } catch (error) {
      if (error instanceof AuthError) return json({ error: { code: "AUTHENTICATION_REQUIRED" } }, error.status);
      if (error instanceof CertificationBodyError) return json({ error: { code: "TRANSLATION_INVALID_INPUT" } }, error.code === "BODY_TOO_LARGE" ? 413 : 400);
      if (error instanceof z.ZodError || error instanceof SyntaxError) return json({ error: { code: "TRANSLATION_INVALID_INPUT" } }, 400);
      const code = error instanceof Error ? error.message : "";
      return json({ error: { code: code === "TRANSLATION_RATE_LIMITED" ? code : "TRANSLATION_UNAVAILABLE" } }, code === "TRANSLATION_RATE_LIMITED" ? 429 : 503);
    }
  };
}
