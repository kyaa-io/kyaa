import "server-only";
import { groupDetailSchema, type GroupDetail } from "@/features/groups/domain/contracts";
import type { AppLocale } from "@/i18n/locales";
import { groupRoute } from "./dependencies";

/** The detail a signed-out reader gets from `GET /api/groups/{id}`, read through the same handler with no credentials.
 * The page layout draws the head from it before the browser signs in; the client re-reads the detail as the viewer. */
export async function loadPublicGroupDetail(pageId: string, locale: AppLocale): Promise<GroupDetail | null> {
  try {
    const response = await groupRoute("detail", new Request(`http://localhost/api/groups/${pageId}?locale=${locale}`), { id: pageId });
    if (!response.ok) return null;
    const read = groupDetailSchema.safeParse(await response.json());
    return read.success && read.data.page.id === pageId ? read.data : null;
  } catch { return null; }
}
