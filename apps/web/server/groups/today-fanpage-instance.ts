import "server-only";
import { createFanpageDependencies } from "@/server/fanpage/dependencies";
import { loadPublicGroupDetailBySlug } from "./public-detail";
import { createTodayFanpageLoader } from "./today-fanpage";

export const TODAY_FANPAGE_LIMIT = 3;
let loader: ReturnType<typeof createTodayFanpageLoader> | undefined;
export function loadTodayFanpages(locale: "ko" | "en") {
  loader ??= createTodayFanpageLoader(createFanpageDependencies().rpc, loadPublicGroupDetailBySlug, TODAY_FANPAGE_LIMIT);
  return loader(locale);
}
