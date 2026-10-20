import "server-only";
import { createFanpageDependencies } from "@/server/fanpage/dependencies";
import { createRunmusicHandlers, runmusicFailure } from "./routes";

export async function handleRunmusic(request: Request, scope: "campaign" | "me" | "admin", action = "read") {
  try {
    const handlers = createRunmusicHandlers(createFanpageDependencies());
    return scope === "campaign" ? handlers.campaign() : scope === "me" ? handlers.me(request) : handlers.admin(request, action);
  } catch (error) { return runmusicFailure(error); }
}
