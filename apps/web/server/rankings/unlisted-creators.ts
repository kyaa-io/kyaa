import "server-only";
import { z } from "zod";
import { createFanpageDependencies } from "@/server/fanpage/dependencies";

/** Published creators whose fan page is unlisted. The home rail's discovery chips leave them out; the viewer's own chip keeps them. */
export async function readUnlistedCreatorSlugs(rpc: (name: string, args: Record<string, unknown>) => Promise<unknown> = (name, args) => createFanpageDependencies().rpc(name, args)) {
  return z.array(z.string()).max(1000).parse(await rpc("list_unlisted_creator_slugs", {}));
}

/**
 * Published creator pages without the kyaa official mark (fan-made pages opened from a request, 20270116060300).
 * Home, gallery and shorts leave them out and 덕질 actions on them pay nothing. A failed read counts as none: until the
 * migration runs there are no such pages, and the lists keep working.
 */
export async function readUnverifiedCreators(rpc: (name: string, args: Record<string, unknown>) => Promise<unknown> = (name, args) => createFanpageDependencies().rpc(name, args)) {
  try {
    const rows = z.array(z.object({ id: z.string().uuid(), slug: z.string() }).strict()).max(5000).parse(await rpc("list_unverified_creators", {}));
    return { ids: new Set(rows.map(row => row.id)), slugs: new Set(rows.map(row => row.slug)) };
  } catch {
    return { ids: new Set<string>(), slugs: new Set<string>() };
  }
}
export type UnverifiedCreators = Awaited<ReturnType<typeof readUnverifiedCreators>>;
