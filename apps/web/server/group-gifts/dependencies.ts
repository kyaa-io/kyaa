import "server-only";
import { createFanpageDependencies } from "@/server/fanpage/dependencies";
import { createGroupGiftHandler, groupGiftFailure } from "./routes";
import type { GroupGiftOperation } from "./domain";
export async function groupGiftRoute(operation: GroupGiftOperation, request: Request, params: { id?: string; applicationId?: string } = {}) {
  if (process.env.KYAA_GROUPS_ENABLED !== "true") return groupGiftFailure(new Error("GROUP_GIFT_NOT_FOUND"));
  try { return await createGroupGiftHandler(createFanpageDependencies())(operation, request, params); }
  catch (error) { return groupGiftFailure(error); }
}
