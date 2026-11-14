import "server-only";
import { createFanpageDependencies } from "@/server/fanpage/dependencies";
import { createTodayFanpageLoader } from "./today-fanpage";

export const TODAY_FANPAGE_LIMIT = 10;
let loader: ReturnType<typeof createTodayFanpageLoader> | undefined;
export function loadTodayFanpages(locale: "ko" | "en") {
  loader ??= createTodayFanpageLoader(createFanpageDependencies().rpc, TODAY_FANPAGE_LIMIT);
  return loader(locale);
}
