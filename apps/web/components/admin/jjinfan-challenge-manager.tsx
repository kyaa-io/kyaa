"use client";

import { useByUsAuth as usePrivy } from "@/features/auth/client/cognito-auth";
import { AlertCircle, RefreshCw } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { JJINFAN_CAMPAIGN_DESCRIPTION_MAX, JJINFAN_CAMPAIGN_TITLE_MAX, jjinfanCampaignListSchema, type JjinfanCampaignRow } from "@/features/rankings/domain/jjinfan-campaign";
import { FanAction } from "@/components/fan-ui/fan-action";
import { AdminAccessState } from "./admin-access-state";
import { AdminOperationsShell, type AdminLocale } from "./operations-shell";
import { useAdminSession } from "./use-admin-session";
import shared from "./admin-directory-manager.module.css";
import styles from "./jjinfan-challenge-manager.module.css";

const copy = {
  ko: {
    eyebrow: "운영 관리", title: "찐팬 100명 게이지", lead: "표시를 켠 크리에이터 페이지에만 게이지가 보입니다. 팬에게 보이는 제목과 설명은 아래 입력값 그대로입니다. 약속처럼 읽히는 문구는 확정된 내용만 쓰세요.",
    enable: "페이지에 표시", titleLabel: "제목", descriptionLabel: "설명", save: "저장", saving: "저장 중…", saved: "저장했습니다.", count: "찐팬", on: "표시 중", off: "꺼짐",
    loading: "크리에이터 목록을 불러오는 중입니다.", empty: "공개된 크리에이터가 없습니다.", loadError: "목록을 불러오지 못했습니다.", retry: "다시 시도", needTitle: "표시하려면 제목을 입력해 주세요.",
    readOnly: "보기 권한은 수정할 수 없습니다.", saveError: "저장하지 못했습니다. 잠시 후 다시 시도해 주세요.",
  },
  en: {
    eyebrow: "Operations", title: "100 true fans gauge", lead: "The gauge appears only on the creator pages turned on here. Fans read the title and description exactly as entered. Write only what has been confirmed if it reads like a promise.",
    enable: "Show on page", titleLabel: "Title", descriptionLabel: "Description", save: "Save", saving: "Saving…", saved: "Saved.", count: "True fans", on: "Showing", off: "Off",
    loading: "Loading creators.", empty: "There are no published creators.", loadError: "Creators could not be loaded.", retry: "Try again", needTitle: "Enter a title to show the gauge.",
    readOnly: "Viewers cannot edit.", saveError: "Could not save. Try again later.",
  },
} as const;
const localeFrom = (value: string | null): AdminLocale => (value === "en" ? "en" : "ko");

export function JjinfanChallengeManager() {
  const session = useAdminSession();
  const locale = localeFrom(useSearchParams().get("lang"));
  if (session.status !== "authorized") return <AdminAccessState status={session.status} locale={locale} />;
  return <AdminOperationsShell locale={locale} adminRole={session.admin.role}><Content locale={locale} canWrite={session.admin.role === "admin"} /></AdminOperationsShell>;
}

function Content({ locale, canWrite }: { locale: AdminLocale; canWrite: boolean }) {
  const t = copy[locale];
  const { getAccessToken } = usePrivy();
  const [items, setItems] = useState<JjinfanCampaignRow[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const load = useCallback(async (signal?: AbortSignal) => {
    setState("loading");
    try {
      const token = await getAccessToken();
      if (!token) throw new Error("missing token");
      const response = await fetch("/api/admin/jjinfan-challenge", { headers: { authorization: `Bearer ${token}` }, cache: "no-store", signal });
      const parsed = jjinfanCampaignListSchema.safeParse(await response.json().catch(() => null));
      if (!response.ok || !parsed.success) throw new Error("load failed");
      setItems(parsed.data.items);
      setState("ready");
    } catch { if (!signal?.aborted) setState("error"); }
  }, [getAccessToken]);
  useEffect(() => { const controller = new AbortController(); void load(controller.signal); return () => controller.abort(); }, [load]);
  return <>
    <header className={shared.heading}><div><p>{t.eyebrow}</p><h1>{t.title}</h1></div></header>
    <p className={styles.lead}>{t.lead}</p>
    {!canWrite && <p className={styles.lead} role="status">{t.readOnly}</p>}
    {state === "loading" && <p className={styles.lead} role="status">{t.loading}</p>}
    {state === "error" && <div className={shared.stateMessage}><AlertCircle aria-hidden="true" /><h3>{t.loadError}</h3><FanAction leadingIcon={<RefreshCw />} onClick={() => void load()}>{t.retry}</FanAction></div>}
    {state === "ready" && items.length === 0 && <div className={shared.stateMessage}><AlertCircle aria-hidden="true" /><h3>{t.empty}</h3></div>}
    {state === "ready" && items.length > 0 && <ul className={styles.list}>{items.map(item => <CampaignRow key={item.celebrityId} item={item} locale={locale} canWrite={canWrite} />)}</ul>}
  </>;
}

function CampaignRow({ item, locale, canWrite }: { item: JjinfanCampaignRow; locale: AdminLocale; canWrite: boolean }) {
  const t = copy[locale];
  const { getAccessToken } = usePrivy();
  const [enabled, setEnabled] = useState(item.enabled);
  const [saved, setSaved] = useState(item.enabled);
  const [title, setTitle] = useState(item.title);
  const [description, setDescription] = useState(item.description);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (enabled && !title.trim()) { setMessage({ ok: false, text: t.needTitle }); return; }
    setBusy(true); setMessage(null);
    try {
      const token = await getAccessToken();
      if (!token) throw new Error("missing token");
      const response = await fetch(`/api/admin/jjinfan-challenge/${item.celebrityId}`, { method: "PUT", cache: "no-store", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ enabled, title, description }) });
      if (!response.ok) throw new Error("save failed");
      setSaved(enabled);
      setMessage({ ok: true, text: t.saved });
    } catch { setMessage({ ok: false, text: t.saveError }); } finally { setBusy(false); }
  }
  return <li className={styles.row}>
    <form onSubmit={event => void submit(event)}>
      <header className={styles.rowHead}>
        <strong>{item.name}</strong>
        <span className={saved ? shared.activeBadge : shared.inactiveBadge}><i aria-hidden="true" />{saved ? t.on : t.off}</span>
        <span className={styles.count}>{t.count} {item.count.toLocaleString(locale)} / 100</span>
      </header>
      <label className={styles.toggle}><input type="checkbox" checked={enabled} disabled={!canWrite || busy} onChange={event => setEnabled(event.target.checked)} />{t.enable}</label>
      <label className={styles.field}><span>{t.titleLabel}</span><input value={title} maxLength={JJINFAN_CAMPAIGN_TITLE_MAX} disabled={!canWrite || busy} onChange={event => setTitle(event.target.value)} /></label>
      <label className={styles.field}><span>{t.descriptionLabel}</span><textarea rows={2} value={description} maxLength={JJINFAN_CAMPAIGN_DESCRIPTION_MAX} disabled={!canWrite || busy} onChange={event => setDescription(event.target.value)} /></label>
      <div className={styles.actions}>
        {message && <span role={message.ok ? "status" : "alert"} className={message.ok ? shared.successMessage : shared.errorMessage}>{message.text}</span>}
        {canWrite && <FanAction variant="primary" type="submit" disabled={busy}>{busy ? t.saving : t.save}</FanAction>}
      </div>
    </form>
  </li>;
}
