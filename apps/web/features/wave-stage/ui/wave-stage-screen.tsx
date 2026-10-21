"use client";

import { useEffect, useRef } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useAdminSession } from "@/components/admin/use-admin-session";
import { AdminAccessState } from "@/components/admin/admin-access-state";
import { clearStageAttempts, useWaveStage } from "./use-wave-stage";
import { useWavePresentation } from "./use-wave-presentation";
import { WaveStageView } from "./wave-stage-view";
import type { StageLocale } from "./wave-stage-copy";

export function WaveStageScreen({ locale }: { locale: StageLocale }) {
  const session = useAdminSession(), auth = usePrivy();
  const owner = auth.authenticated ? auth.user?.id ?? null : null;
  const previousOwner = useRef<string | null>(null);
  useEffect(() => {
    if (!auth.ready) return;
    if (previousOwner.current && previousOwner.current !== owner) clearStageAttempts(previousOwner.current);
    previousOwner.current = owner;
  }, [auth.ready, owner]);
  if (session.status !== "authorized") return <AdminAccessState status={session.status} locale={locale} />;
  if (!owner) return <AdminAccessState status="loading" locale={locale} />;
  return <WaveStageOperations key={`${owner}:${session.admin.role}`} owner={owner} role={session.admin.role} locale={locale} getAccessToken={auth.getAccessToken} />;
}
export function WaveStageOperations({ owner, role, locale, getAccessToken }: { owner: string; role: string; locale: StageLocale; getAccessToken: () => Promise<string | null> }) {
  const state = useWaveStage(owner, getAccessToken);
  const presentation = useWavePresentation(getAccessToken);
  if (state.access || presentation.presentationAccess) return <AdminAccessState status={state.access ?? presentation.presentationAccess!} locale={locale} />;
  return <WaveStageView {...state} {...presentation} onScopeChange={presentation.setScope} locale={locale} role={role} onRefresh={() => { void state.refreshAll(); presentation.refreshPresentation(); }} onDraw={() => void state.draw(role)} />;
}
