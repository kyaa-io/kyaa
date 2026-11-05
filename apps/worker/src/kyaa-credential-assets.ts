import { WorkerError, type CommunityStampPayloadV1, type EntityType, type JobPayload, type StampPayloadV1 } from "./domain.js";

export const KYAA_CREDENTIAL_ASSET_BASE_URI = "ipfs://bafybeicrvmcnekzfyoktq3kb2rkvy2dvsfxtczs65e2b3sgjehvi4dm3ni/credentials/v2";
export const FIRST_CLIP_IMAGE_URI = "ipfs://bafkreihlnpo2ls4nfvu6neigzzljqorlywqkbjdl734fx3o5pqzi5jma3e";

// This published bundle is closed: new legacy kinds need separately reviewed v2 artwork.
const reviewedCommunityImages = new Set(["welcome", "first_comment", "subscription", "support", "invite", "daily_checkin", "share"]);

// Renewal stamp art (PR-STAMP-ART mapping). Served from the web public path, not pinned to IPFS;
// the image URI is content-addressed only by file name, so swap to a pinned bundle before mainnet.
// The site that serves the art follows the worker environment; unknown or missing fails instead of defaulting to production.
export const RENEWAL_SITE_BY_ENVIRONMENT = { dev: "https://dev.kyaa.io", prod: "https://kyaa.io" } as const;
export function renewalStampImageBaseUri(workerEnvironment: string | undefined): string {
  const site = workerEnvironment === "dev" || workerEnvironment === "prod" ? RENEWAL_SITE_BY_ENVIRONMENT[workerEnvironment] : undefined;
  if (!site) throw new WorkerError("RENEWAL_IMAGE_ENVIRONMENT_UNKNOWN", "Renewal stamp images require WORKER_ENVIRONMENT dev or prod", false);
  return `${site}/images/stamps/ink-v1`;
}
export const renewalStampImageNames = {
  post: "post", comment: "first-comment", reaction: "first-like", live_reserve: "reservation", live_attend: "attendance",
  survey: "survey", mission: "mission", event_checkin: "event-checkin", event_review: "event-review", cheer: "support",
  proof: "proof", quiz: "knowledge", steady_checkin: "steady-checkin",
} as const;
export function renewalStampImageUri(kind: string, workerEnvironment: string | undefined): string | undefined {
  const name = (renewalStampImageNames as Record<string, string>)[kind];
  return name ? `${renewalStampImageBaseUri(workerEnvironment)}/${name}.webp` : undefined;
}

const stampImages = { Knowledge: "knowledge", Reservation: "reservation", Attendance: "attendance", Survey: "survey", Membership: "membership" } as const;

export function kyaaCredentialImage(entityType: EntityType, payload: JobPayload, assetBaseUri: string, actionCode?: number, workerEnvironment?: string): string {
  const base = assetBaseUri.replace(/\/$/, "");
  if (base !== KYAA_CREDENTIAL_ASSET_BASE_URI) {
    throw new WorkerError("UNVERIFIED_CREDENTIAL_ASSETS", "Unverified kyaa image bundle", false);
  }
  let key: string | undefined;
  if (entityType === "passport") key = "passport";
  if (entityType === "reaction") key = "reaction";
  if (entityType === "stamp") {
    key = stampImages[(payload as StampPayloadV1).stampType];
    if (key && actionCode === 4) key = "mission";
  }
  if (entityType === "community_stamp") {
    const kind = (payload as CommunityStampPayloadV1).stampKind;
    if (kind === "wave_mission") key = "mission";
    if (kind === "first_clip") return FIRST_CLIP_IMAGE_URI;
    const renewal = renewalStampImageUri(kind, workerEnvironment);
    if (renewal) return renewal;
    if (reviewedCommunityImages.has(kind)) key = kind;
  }
  if (!key) throw new WorkerError("UNSUPPORTED_CREDENTIAL_IMAGE", "Unsupported kyaa credential image", false);
  return `${base}/${key}.png`;
}
