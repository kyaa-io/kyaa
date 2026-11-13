"use client";
import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { FanAction } from "@/components/fan-ui/fan-action";
import { FanHeading } from "@/components/fan-ui/fan-heading";
import { FanIcon } from "@/components/fan-ui/fan-icon";
import { Camera, ImagePlus } from "@/components/fan-ui/fan-icons";
import { FanPageHeader } from "@/components/fan-ui/fan-page-header";
import { FanSurface } from "@/components/fan-ui/fan-surface";
import { FanText } from "@/components/fan-ui/fan-text";
import { useWaveMediaUpload } from "@/features/content-safety/ui/use-wave-media-upload";
import type { AppLocale } from "@/i18n/locales";
import { LEADER_PASS_TOKEN, leaderPassCheckSchema, leaderPassOpenedSchema } from "../domain/leader-pass";
import { GroupApplication } from "./group-application";
import { groupApplyText } from "./group-apply-copy";
import { groupsCopy } from "./copy";
import { GroupImage } from "./group-image";
import { GroupShell } from "./group-shell";
import { managementCopy } from "./management-copy";
import { useGroupRequest } from "./use-group-resource";
import { useRoomLinkFields } from "./room-link-fields";
import styles from "./group-leader-open.module.css";

/** 사진 한 장: 원형 104. 올리는 동안은 로컬 미리보기를 보여 주고, 서버가 받은 자산 번호만 돌려준다. */
function LeaderPhoto({ locale, disabled, onChange, onReady }: { locale: AppLocale; disabled: boolean; onChange: (preview: string | undefined, assetId: string | null) => void; onReady: (ready: boolean) => void }) {
  const upload = useWaveMediaUpload("group_image", 1);
  const task = upload.items[0];
  const ready = !task || Boolean(upload.ready && !upload.busy && !task.failed);
  const [preview, setPreview] = useState<{ file: File; url: string }>();
  useEffect(() => { onReady(ready); }, [ready, onReady]);
  useEffect(() => {
    if (!task) return;
    const url = URL.createObjectURL(task.file);
    setPreview({ file: task.file, url });
    return () => URL.revokeObjectURL(url);
  }, [task]);
  const url = task && preview?.file === task.file ? preview.url : undefined;
  const assetId = task?.assetId ?? null;
  useEffect(() => { onChange(url, assetId); }, [url, assetId, onChange]);
  const t = groupsCopy(locale);
  return <div className={styles.photo}>
    <label className={styles.photoPick} data-disabled={disabled || undefined}>
      {url ? <GroupImage locale={locale} className={styles.photoImage} src={url} width={104} height={104} alt="" /> : <span className={styles.photoEmpty}><FanIcon icon={ImagePlus} size={24} /></span>}
      <span className={styles.photoBadge} aria-hidden="true"><FanIcon icon={Camera} size={16} /></span>
      <input className={styles.photoInput} type="file" accept="image/jpeg,image/png,image/webp" aria-label={groupApplyText(locale, "changePhoto")} disabled={disabled || upload.busy || Boolean(task)}
        onChange={(event) => { const file = event.target.files?.[0]; if (file) upload.add([file]); event.target.value = ""; }} />
    </label>
    {task ? <FanAction variant="text" size="sm" disabled={disabled || upload.busy} onClick={() => upload.remove(task.key)}>{managementCopy(locale).remove}</FanAction> : null}
    {task?.failed ? <FanAction variant="text" size="sm" disabled={disabled} onClick={() => upload.retry(task)}>{t.retry}</FanAction> : null}
    {upload.invalid ? <div role="alert"><FanText role="meta" as="p" className={styles.error}>{t.error}</FanText></div> : null}
  </div>;
}

/** 방장 패스로 들어온 모임 열기. 패스가 쓸 수 없으면 일반 신청 폼에 오류 한 줄을 붙여 그대로 보여 준다. */
export function GroupLeaderOpen({ locale, pass, initialName }: { locale: AppLocale; pass: string; initialName?: string }) {
  const t = groupsCopy(locale);
  const auth = useGroupRequest();
  const router = useRouter();
  const formId = useId();
  const [state, setState] = useState<"checking" | "valid" | "invalid">(LEADER_PASS_TOKEN.test(pass) ? "checking" : "invalid");
  const [name, setName] = useState(initialName ?? "");
  const [description, setDescription] = useState("");
  const [photo, setPhoto] = useState<{ preview?: string; assetId: string | null }>({ assetId: null });
  const [photoReady, setPhotoReady] = useState(true);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const operation = useRef<{ body: string; id: string } | null>(null);
  const inFlight = useRef(false);
  const rooms = useRoomLinkFields({ locale, disabled: pending });

  useEffect(() => {
    if (state !== "checking" || !auth.authenticated || !auth.ready) return;
    let live = true;
    auth.request("/api/groups/leader-passes/check", { method: "POST", body: JSON.stringify({ token: pass }) })
      .then((value) => { if (live) setState(leaderPassCheckSchema.parse(value).valid ? "valid" : "invalid"); })
      .catch(() => { if (live) setState("invalid"); });
    return () => { live = false; };
  }, [state, auth.authenticated, auth.ready, auth.request, pass]);

  const preview = useMemo(() => ({ src: photo.preview, alt: "" }), [photo.preview]);
  const onPhoto = useMemo(() => (url: string | undefined, assetId: string | null) => setPhoto((current) => (current.preview === url && current.assetId === assetId ? current : { preview: url, assetId })), []);

  if (state === "invalid") return <GroupApplication locale={locale} initialName={initialName} notice={groupApplyText(locale, "passInvalid")} />;
  const returnTo = `/pages/groups/apply?locale=${locale}&pass=${encodeURIComponent(pass)}`;
  if (auth.ready && !auth.authenticated) return <GroupShell locale={locale}><div className={styles.login}><FanAction href={`/login?returnTo=${encodeURIComponent(returnTo)}`}>{t.login}</FanAction></div></GroupShell>;
  if (state === "checking") return <GroupShell locale={locale}><div className={styles.login} role="status" aria-busy="true"><span className={styles.pending}>{t.loading}</span></div></GroupShell>;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current || pending || !photoReady || !name.trim()) return;
    const externalLinks = rooms.read();
    if (!externalLinks) return;
    const payload = { token: pass, name: name.trim(), description: description.trim(), imageAssetId: photo.assetId ?? undefined, ...(externalLinks.length ? { externalLinks } : {}) };
    const body = JSON.stringify(payload);
    if (operation.current?.body !== body) operation.current = { body, id: crypto.randomUUID() };
    inFlight.current = true; setPending(true); setFailed(false);
    try {
      const opened = leaderPassOpenedSchema.parse(await auth.request("/api/groups/applications/with-pass", { method: "POST", body: JSON.stringify({ ...payload, requestId: operation.current.id }) }));
      router.push(`/pages/groups/${opened.pageId}/manage?section=invite&locale=${locale}`);
    } catch (error) {
      const status = typeof error === "object" && error !== null && "status" in error ? (error as { status: number }).status : 0;
      if (status === 404 || status === 409) setState("invalid"); else setFailed(true);
      inFlight.current = false; setPending(false);
    }
  }

  return <GroupShell locale={locale}>
    <div className={styles.layout}>
      <form id={formId} className={styles.form} onSubmit={submit}>
        <FanHeading as="h1">{groupApplyText(locale, "openGroup")}</FanHeading>
        <div className={styles.identity}>
          <LeaderPhoto locale={locale} disabled={pending} onChange={onPhoto} onReady={setPhotoReady} />
          <label className={styles.field}>
            <FanText role="item">{locale === "ko" ? "모임 이름" : t.name}</FanText>
            <input className={styles.input} name="name" required maxLength={100} value={name} disabled={pending} onChange={(event) => setName(event.target.value)} />
          </label>
        </div>
        <label className={styles.field}>
          <span className={styles.labelRow}><FanText role="item">{groupApplyText(locale, "groupIntro")}</FanText><FanText role="meta">{groupApplyText(locale, "optional")}</FanText></span>
          <textarea className={styles.textarea} name="description" maxLength={1000} value={description} disabled={pending} onChange={(event) => setDescription(event.target.value)} />
        </label>
        {rooms.node}
        {failed ? <div role="alert"><FanText role="meta" as="p" className={styles.error}>{t.error}</FanText></div> : null}
        <div className={styles.submit}><FanAction type="submit" variant="primary" disabled={pending || !photoReady || !name.trim()}>{pending ? t.loading : groupApplyText(locale, "openGroup")}</FanAction></div>
      </form>
      <aside className={styles.preview}>
        <FanHeading>{groupApplyText(locale, "preview")}</FanHeading>
        <FanSurface>
          <FanPageHeader image={preview} name={name.trim() || t.name} kind="hobby" locale={locale} description={description.trim() || undefined} links={rooms.links.map((link) => ({ kind: link.kind, href: link.url }))} />
        </FanSurface>
      </aside>
    </div>
  </GroupShell>;
}
