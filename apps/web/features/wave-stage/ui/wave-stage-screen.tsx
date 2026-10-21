"use client";

import { useEffect, useRef, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useAdminSession } from "@/components/admin/use-admin-session";
import { AdminAccessState } from "@/components/admin/admin-access-state";
import { clearStageAttempts, useWaveStage } from "./use-wave-stage";
import { useWavePresentation } from "./use-wave-presentation";
import { WaveStageView } from "./wave-stage-view";
import { toStageHostProjection } from "../domain/stage-host-projection";
import { useWaveOperator } from "./use-wave-operator";
import { useStageHostEndpoint, useStageHostSource } from "./use-stage-host-source";
import type { StageLocale } from "./wave-stage-copy";

export function WaveStageScreen({ locale }: { locale: StageLocale }) {
  const session = useAdminSession(), auth = usePrivy();
  const endpoint = useStageHostEndpoint();
  const owner = auth.authenticated ? auth.user?.id ?? null : null;
  const previousOwner = useRef<string | null>(null);
  useEffect(() => {
    if (!auth.ready) return;
    if (previousOwner.current && previousOwner.current !== owner) clearStageAttempts(previousOwner.current);
    previousOwner.current = owner;
  }, [auth.ready, owner]);
  if (session.status !== "authorized") return <AdminAccessState status={session.status} locale={locale} />;
  if (!owner) return <AdminAccessState status="loading" locale={locale} />;
  return <WaveStageOperations key={`${owner}:${session.admin.role}`} endpoint={endpoint} owner={owner} role={session.admin.role} locale={locale} getAccessToken={auth.getAccessToken} />;
}
export function WaveStageOperations({ endpoint = null, owner, role, locale, getAccessToken }: { endpoint?: string | null; owner: string; role: string; locale: StageLocale; getAccessToken: () => Promise<string | null> }) {
  const [paired, setPaired] = useState(false);
  const state = useWaveStage(owner, getAccessToken, paired);
  const presentation = useWavePresentation(getAccessToken, paired);
  const authorized = !state.access && !presentation.presentationAccess;
  const operations = useWaveOperator({ enabled: paired && authorized, role, getAccessToken, drawLive: state.draw, readLive: state.refresh });
  const refresh = () => { void state.refreshAll(); presentation.refreshPresentation(); };
  const bridge = useStageHostSource({ endpoint, authorized,
    projection: authorized ? toStageHostProjection({ ...presentation, stage: state.stage, onsite: operations.onsite }) : null,
    onScope: presentation.setScope, onRefresh: refresh, operator: operations.operator, onOperator: operations.execute,
  });
  const { cancelDraw } = state;
  useEffect(() => { setPaired(bridge.connected); if (!bridge.connected) cancelDraw(); }, [bridge.connected, cancelDraw]);
  if (state.access || presentation.presentationAccess) return <AdminAccessState status={state.access ?? presentation.presentationAccess!} locale={locale} />;
  const sourceControls = bridge.available && <>
    <p role="status">{locale === "ko" ? (bridge.connected ? "무대 콘솔 연결됨" : bridge.status === "connecting" ? "무대 콘솔 연결 중" : (role === "admin" || role === "editor" ? "연결한 iPad에서 스탬프 발급과 추첨을 실행할 수 있습니다." : "무대 콘솔에 집계와 공개 결과를 전송합니다.")) : (bridge.connected ? "Stage console connected" : bridge.status === "connecting" ? "Connecting to stage console" : (role === "admin" || role === "editor" ? "Connect to allow stamp grants and draws from your paired iPad." : "Connect to share aggregates and published results with the stage console."))}</p>
    <button type="button" disabled={bridge.status === "connecting"} onClick={bridge.connected ? bridge.disconnect : bridge.connect}>{locale === "ko" ? (bridge.connected ? "콘솔 연결 해제" : "무대 콘솔 연결") : (bridge.connected ? "Disconnect console" : "Connect stage console")}</button>
  </>;
  return <WaveStageView sourceControls={sourceControls} {...state} {...presentation} onScopeChange={presentation.setScope} locale={locale} role={role} onRefresh={refresh} onDraw={() => void state.draw(role)} />;
}
