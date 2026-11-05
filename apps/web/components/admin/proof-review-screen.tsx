"use client";

import { useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { useByUsAuth as usePrivy } from "@/features/auth/client/cognito-auth";
import { AdminAccessState } from "./admin-access-state";
import { AdminOperationsShell } from "./operations-shell";
import { useAdminSession } from "./use-admin-session";
import { ProofReviewPanel, type ProofRequest } from "./proof-review-panel";

export function AuthorizedProofReview() {
  const locale = useSearchParams().get("lang") === "en" ? "en" : "ko";
  const session = useAdminSession();
  const { getAccessToken } = usePrivy();
  const request = useCallback<ProofRequest>(async (url, method = "GET", body) => {
    const token = await getAccessToken();
    const response = await fetch(url, {
      method, cache: "no-store", body: body ? JSON.stringify(body) : undefined,
      headers: { authorization: `Bearer ${token ?? ""}`, "content-type": "application/json", "x-correlation-id": crypto.randomUUID() },
    });
    return { ok: response.ok, status: response.status, data: await response.json().catch(() => null) };
  }, [getAccessToken]);
  if (session.status !== "authorized") return <AdminAccessState locale={locale} status={session.status} />;
  return (
    <AdminOperationsShell locale={locale} adminRole={session.admin.role}>
      <main style={{ display: "grid", gap: 16, padding: 16 }}>
        <h1>{locale === "ko" ? "인증 증빙 검토" : "Proof review"}</h1>
        <ProofReviewPanel locale={locale} request={request} canWrite={session.admin.role !== "viewer"} />
      </main>
    </AdminOperationsShell>
  );
}
