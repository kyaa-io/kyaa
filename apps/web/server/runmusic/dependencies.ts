import "server-only";
import { after } from "next/server";
import { createFanpageDependencies } from "@/server/fanpage/dependencies";
import { createRunmusicHandlers, runmusicFailure } from "./routes";
import { parseRunmusicContactKey } from "./contact-crypto";
import { processRunmusicTelegram } from "./telegram";

export async function handleRunmusic(request: Request, scope: "campaign" | "me" | "admin", action = "read") {
  try {
    const deps = createFanpageDependencies();
    const handlers = createRunmusicHandlers(deps, () => parseRunmusicContactKey(process.env.RUNMUSIC_CONTACT_ENCRYPTION_KEY), appUserId => {
      after(async () => {
        try { await processRunmusicTelegram(deps.rpc, appUserId); }
        catch { console.error("RUNMUSIC_TELEGRAM_PROCESS_FAILED"); }
      });
    });
    return scope === "campaign" ? handlers.campaign() : scope === "me" ? handlers.me(request) : handlers.admin(request, action);
  } catch (error) { return runmusicFailure(error); }
}
