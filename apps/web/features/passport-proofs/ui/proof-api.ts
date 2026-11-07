import {
  proofCommandResultSchema, myProofsSchema, proofBoardSchema, proofMissionListSchema,
  type ProofType,
} from "@/features/passport/domain/proof-types";
import { z } from "zod";

export type ProofFailure = "limit" | "pii" | "upload" | "expired" | "open" | "approved" | "auth" | "generic";

export function failureFromCode(status: number, code: string | undefined): ProofFailure {
  if (code === "PROOF_MONTHLY_LIMIT" || status === 429) return "limit";
  if (code === "PROOF_PII_DETECTED") return "pii";
  if (code === "UPLOAD_EXPIRED" || status === 410) return "expired";
  if (code === "UPLOAD_INVALID" || code === "INVALID_IMAGE" || code === "BODY_TOO_LARGE") return "upload";
  if (code === "PROOF_ALREADY_OPEN") return "open";
  if (code === "PROOF_ALREADY_APPROVED") return "approved";
  if (status === 401) return "auth";
  return "generic";
}

export class ProofRequestError extends Error {
  constructor(readonly kind: ProofFailure, readonly status: number) {
    super(kind);
  }
}

async function readCode(response: Response) {
  try {
    const body = (await response.json()) as { error?: { code?: string } };
    return body.error?.code;
  } catch {
    return undefined;
  }
}

async function ensureOk(response: Response) {
  if (!response.ok) throw new ProofRequestError(failureFromCode(response.status, await readCode(response)), response.status);
  return response.json();
}

export type TokenGetter = () => Promise<string | null>;

/** Every signed-in call goes through here: no token means the request is never sent and the caller shows the usual login entry. */
async function authedFetch(getToken: TokenGetter, url: string, init: RequestInit = {}) {
  const token = await getToken().catch(() => null);
  if (!token) throw new ProofRequestError("auth", 401);
  return fetch(url, { ...init, headers: { ...(init.headers as Record<string, string> | undefined), Authorization: `Bearer ${token}` } });
}

const uploadSchema = z.object({ uploadId: z.string().uuid() });

export async function uploadProofImage(getToken: TokenGetter, missionId: string, blob: Blob) {
  const form = new FormData();
  form.append("file", blob, "proof.webp");
  const response = await authedFetch(getToken, `/api/certifications/${encodeURIComponent(missionId)}/uploads`, { method: "POST", body: form });
  return uploadSchema.parse(await ensureOk(response)).uploadId;
}

export async function submitProof(getToken: TokenGetter, input: {
  creator: string; proofType: ProofType; uploadId: string; publishConsent: boolean;
  amountVisible: boolean | null; imagePhash: string[]; note?: string; locale?: string;
}) {
  const response = await authedFetch(getToken, "/api/me/proofs", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ requestKey: crypto.randomUUID(), ...input }),
  });
  return proofCommandResultSchema.parse(await ensureOk(response));
}

export async function resubmitProof(getToken: TokenGetter, submissionId: string, input: { expectedRevision: number; uploadId: string; imagePhash: string[]; note?: string; locale?: string }) {
  const response = await authedFetch(getToken, `/api/me/proofs/${encodeURIComponent(submissionId)}/resubmit`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  return proofCommandResultSchema.parse(await ensureOk(response));
}

export async function listMyProofs(getToken: TokenGetter, creator: string) {
  const response = await authedFetch(getToken, `/api/me/proofs?creator=${encodeURIComponent(creator)}`, { cache: "no-store" });
  return myProofsSchema.parse(await ensureOk(response)).items;
}

/** A signed-in viewer sends the session token so the server leaves out authors that viewer blocked; the response is then never cached. */
export async function listProofBoard(pageIdOrSlug: string, before?: string, token?: string | null) {
  const query = new URLSearchParams({ category: "proof", limit: "20", ...(before ? { before } : {}) });
  const response = await fetch(`/api/pages/${encodeURIComponent(pageIdOrSlug)}/posts?${query}`,
    token ? { cache: "no-store", headers: { Authorization: `Bearer ${token}` } } : undefined);
  return proofBoardSchema.parse(await ensureOk(response));
}

export async function listProofMissions(getToken: TokenGetter, creator: string) {
  const response = await authedFetch(getToken, `/api/me/proofs/missions?creator=${encodeURIComponent(creator)}`, { cache: "no-store" });
  return proofMissionListSchema.parse(await ensureOk(response)).items;
}
