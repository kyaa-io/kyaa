import "server-only";
import { creatorSlugSchema } from "@/features/passport/domain/dukjil-types";
import { jjinfanChallengeSchema, type JjinfanChallenge } from "@/features/rankings/domain/types";
import { resolveCreatorId } from "@/server/dukjil/creator-id";
import { createFanpageDependencies } from "@/server/fanpage/dependencies";

/** The live gauge for a share preview. Null when the creator is unknown or no administrator turned the challenge on. */
export async function readSharedJjinfanChallenge(slug: string, deps: { resolveCreatorId(slug: string): Promise<string | null>; rpc(name: string, args: Record<string, unknown>): Promise<unknown> } = {
  resolveCreatorId, rpc: (name, args) => createFanpageDependencies().rpc(name, args),
}): Promise<(JjinfanChallenge & { campaign: { title: string; description: string } }) | null> {
  if (!creatorSlugSchema.safeParse(slug).success) return null;
  const id = await deps.resolveCreatorId(slug);
  if (!id) return null;
  const parsed = jjinfanChallengeSchema.safeParse(await deps.rpc("read_jjinfan_gauge", { p_celebrity: id }));
  if (!parsed.success || !parsed.data.campaign) return null;
  return { ...parsed.data, campaign: parsed.data.campaign };
}

/** The gauge's answer for the fan page's first paint: the challenge (campaign null when off), or undefined when it cannot be read here. */
export async function readJjinfanSeed(slug: string, deps: { resolveCreatorId(slug: string): Promise<string | null>; rpc(name: string, args: Record<string, unknown>): Promise<unknown> } = {
  resolveCreatorId, rpc: (name, args) => createFanpageDependencies().rpc(name, args),
}): Promise<JjinfanChallenge | undefined> {
  try {
    if (!creatorSlugSchema.safeParse(slug).success) return undefined;
    const id = await deps.resolveCreatorId(slug);
    if (!id) return undefined;
    const parsed = jjinfanChallengeSchema.safeParse(await deps.rpc("read_jjinfan_gauge", { p_celebrity: id }));
    return parsed.success ? parsed.data : undefined;
  } catch { return undefined; }
}
