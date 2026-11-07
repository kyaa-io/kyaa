import "server-only";
import { z } from "zod";
import { createFanpageDependencies } from "@/server/fanpage/dependencies";

/** Published creators whose fan page is unlisted. The home rail's discovery chips leave them out; the viewer's own chip keeps them. */
export async function readUnlistedCreatorSlugs(rpc: (name: string, args: Record<string, unknown>) => Promise<unknown> = (name, args) => createFanpageDependencies().rpc(name, args)) {
  return z.array(z.string()).max(1000).parse(await rpc("list_unlisted_creator_slugs", {}));
}
