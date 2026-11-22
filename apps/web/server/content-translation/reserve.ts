type Rpc = (name: string, args: Record<string, unknown>) => Promise<unknown>;

/** Reserves translation characters. When the budget refuses, the refusal is recorded once per exhausted service day or month
 *  (the refused transaction rolled back, so the database cannot record it there), then the refusal is passed on unchanged. */
export async function reserveTranslation(rpc: Rpc, name: "reserve_display_translation_request" | "reserve_content_translation_request",
  args: Record<string, unknown> & { p_character_count: number }): Promise<void> {
  try {
    await rpc(name, args);
  } catch (error) {
    if (error instanceof Error && error.message === "TRANSLATION_RATE_LIMITED") {
      await rpc("record_translation_limit_block", { p_character_count: args.p_character_count }).catch(() => undefined);
    }
    throw error;
  }
}
