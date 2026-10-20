"use client";

import { useEffect, useRef, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useAdminSession } from "@/components/admin/use-admin-session";
import { AdminAccessState } from "@/components/admin/admin-access-state";
import { LiveVideo, type PlayerStatus } from "@/features/live/ui/tiktok-live-player";
import type { ObservedLiveCard } from "@/features/live/domain/observed-live";
import { clearStageAttempts, useWaveStage } from "./use-wave-stage";
import { useWavePresentation } from "./use-wave-presentation";
import { WaveStageView } from "./wave-stage-view";
import type { StageLocale } from "./wave-stage-copy";

// The registered creator identity is shared with WaveLivePanel; the event slug is not a playback slug.
const changha: ObservedLiveCard = {
  platform: "tiktok", celebritySlug: "changha", creatorName: "창하", handle: "chang._.a",
  title: "TikTok LIVE", watchUrl: "https://www.tiktok.com/@chang._.a/live", thumbnailUrl: "/images/kyaa-wave/changha-cheer.jpg",
  observedAt: "2026-10-22T00:00:00Z", expiresAt: "2026-10-22T00:01:30Z",
};
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
  const [status, setStatus] = useState<PlayerStatus>("loading");
  if (state.access || presentation.presentationAccess) return <AdminAccessState status={state.access ?? presentation.presentationAccess!} locale={locale} />;
  return <WaveStageView {...state} {...presentation} onScopeChange={presentation.setScope} locale={locale} role={role} onRefresh={() => { void state.refreshAll(); presentation.refreshPresentation(); }} onDraw={() => void state.draw(role)} video={state.visible ? <LiveVideo item={changha} locale={locale} status={status} setStatus={setStatus} inline /> : null} />;
}
