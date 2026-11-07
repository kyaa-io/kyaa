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

/** Whether a signed-out reader sees no posts on the page, read through the same handler as `GET /api/groups/{id}/posts`.
 * No public post means the home gallery (public photos only) stays empty for every viewer. Unknown (error) is false. */
export async function loadPublicGroupPostsEmpty(pageId: string): Promise<boolean> {
  try {
    const response = await groupRoute("posts", new Request(`http://localhost/api/groups/${pageId}/posts?category=all&search=&sort=recent&limit=1`), { id: pageId });
    if (!response.ok) return false;
    const body = (await response.json()) as { items?: unknown };
    return Array.isArray(body.items) && body.items.length === 0;
  } catch { return false; }
}
