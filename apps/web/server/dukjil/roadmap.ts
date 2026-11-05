import "server-only";
import { z } from "zod";
import { dukjilFailure, type DukjilDependencies } from "./routes";

// Contract §3.3/§4. The route key is the passport id; the database stamp functions are keyed by creator,
// so the read RPC resolves the creator for an owned passport. `read_passport_roadmap(p_user, p_celebrity)` returns `jjinfan`;
// stamps are placed inside dukjil_issue_stamp, so there is no separate assignment call here.
const uuid = z.uuid();
export const passportIdSchema = uuid;
export const MISSION_SLOT_COUNT = 9;

// Database shape (migration 20261210132000 read_passport_roadmap). Strict, so drift surfaces as 503 instead of leaking through.
const dbSlotSchema = z.object({ slot: z.number().int().min(1).max(MISSION_SLOT_COUNT), action: z.string().min(1).nullable(), filled: z.boolean(), stampId: z.uuid().nullable(), clearedAt: z.string().nullable() }).strict();
const dbPageSchema = z.object({
  pageNo: z.number().int().min(1), slots: z.array(dbSlotSchema).length(MISSION_SLOT_COUNT), filled: z.number().int().min(0).max(MISSION_SLOT_COUNT),
  claimable: z.boolean(), claimed: z.boolean(), locked: z.boolean(), lockReason: z.enum(["PASSPORT_CLAIM_LOCKED_UNTIL_JJINFAN"]).nullable(),
}).strict();
const dbRoadmapSchema = z.object({ passportId: uuid, pages: z.array(dbPageSchema), hearts: z.number().int().min(0), jjinfan: z.boolean() }).strict();

export const roadmapSlotSchema = z.object({
  slotNo: z.number().int().min(1).max(MISSION_SLOT_COUNT),
  kind: z.string().min(1).nullable(),
  state: z.enum(["empty", "filled"]),
  stampId: z.uuid().nullable(),
  clearedAt: z.string().nullable(),
}).strict();

export const roadmapPageSchema = z.object({
  pageNo: z.number().int().min(1),
  slots: z.array(roadmapSlotSchema).length(MISSION_SLOT_COUNT),
  filled: z.number().int().min(0).max(MISSION_SLOT_COUNT),
  claimable: z.boolean(),
  claimed: z.boolean(),
  locked: z.boolean(),
  lockedReason: z.enum(["jjinfan_required"]).nullable(),
}).strict();

export const roadmapSchema = z.object({
  passportId: uuid,
  celebrityId: uuid,
  hearts: z.number().int().min(0),
  jjinfan: z.boolean(),
  pages: z.array(roadmapPageSchema),
}).strict();
export type PassportRoadmap = z.infer<typeof roadmapSchema>;

const privateHeaders = { "cache-control": "private, no-store", vary: "Authorization" };

// The route id is the passport id; the database is keyed by (user, celebrity). The creator comes from the owner's own passport row, never from the client.
export async function resolveOwnedCreator(deps: DukjilDependencies, appUserId: string, passportId: string): Promise<string> {
  const resolve = deps.resolveOwnedPassportCreator ?? (await import("./creator-id")).resolveOwnedPassportCreator;
  const celebrityId = await resolve(passportId, appUserId);
  if (!celebrityId) throw new Error("PASSPORT_NOT_FOUND");
  return celebrityId;
}

export async function readOwnedRoadmap(deps: DukjilDependencies, appUserId: string, passportId: string): Promise<PassportRoadmap> {
  const celebrityId = await resolveOwnedCreator(deps, appUserId, passportId);
  const raw = await deps.rpc("read_passport_roadmap", { p_user: appUserId, p_celebrity: celebrityId });
  const parsed = dbRoadmapSchema.safeParse(raw);
  if (!parsed.success || parsed.data.passportId !== passportId) throw new Error("DUKJIL_UNAVAILABLE");
  const db = parsed.data;
  return roadmapSchema.parse({
    passportId: db.passportId, celebrityId, hearts: db.hearts, jjinfan: db.jjinfan,
    pages: db.pages.map((page) => ({
      pageNo: page.pageNo, filled: page.filled, claimable: page.claimable, claimed: page.claimed, locked: page.locked,
      lockedReason: page.lockReason === "PASSPORT_CLAIM_LOCKED_UNTIL_JJINFAN" ? "jjinfan_required" : null,
      slots: page.slots.map((slot) => ({ slotNo: slot.slot, kind: slot.action, state: slot.filled ? "filled" : "empty", stampId: slot.stampId, clearedAt: slot.clearedAt })),
    })),
  });
}

export function createRoadmapHandler(deps: DukjilDependencies) {
  return {
    roadmap: async (request: Request, passportId: string) => {
      try {
        const { appUserId } = await deps.authorize(request.headers.get("authorization"));
        const roadmap = await readOwnedRoadmap(deps, appUserId, passportIdSchema.parse(passportId));
        return Response.json(roadmap, { headers: privateHeaders });
      } catch (error) {
        return dukjilFailure(error);
      }
    },
  };
}
