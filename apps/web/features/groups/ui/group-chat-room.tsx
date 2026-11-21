"use client";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type FormEvent } from "react";
import type { AppLocale } from "@/i18n/locales";
import { FanAction } from "@/components/fan-ui/fan-action";
import { FanDialog } from "@/components/fan-ui/fan-dialog";
import { FanIcon } from "@/components/fan-ui/fan-icon";
import { FanIconButton } from "@/components/fan-ui/fan-icon-button";
import { ArrowDown, ImagePlus, MoreHorizontal, X } from "@/components/fan-ui/fan-icons";
import { FanMenu } from "@/components/fan-ui/fan-menu";
import { FanSkeleton } from "@/components/fan-ui/fan-skeleton";
import { FanTag } from "@/components/fan-ui/fan-tag";
import { FanText } from "@/components/fan-ui/fan-text";
import { showFanToast } from "@/components/fan-ui/fan-toast";
import { fanUiText } from "@/components/fan-ui/fan-ui-copy";
import { AuthenticatedMedia } from "@/features/content-safety/ui/authenticated-media";
import { useWaveMediaUpload } from "@/features/content-safety/ui/use-wave-media-upload";
import detailStyles from "@/features/fan-posts/ui/post-detail.module.css";
import { mediaCopy } from "@/features/group-social/media-preview";
import { VIDEO_MAX_SECONDS } from "@/server/mobile-media/domain";
import { GROUP_CHAT_MAX_LENGTH, groupChatSchema, type GroupChat } from "../domain/contracts";
import { boardCopy } from "./board-copy";
import { chatCopy } from "./chat-copy";
import { groupsCopy } from "./copy";
import { groupCommentCopy } from "./group-comment-copy";
import { GroupImage } from "./group-image";
import { managementCopy, sendLabel } from "./management-copy";
import { roomEntryCopy, roomMessageLabel } from "./room-entry-copy";
import { roomStatusCopy } from "./room-status-copy";
import { SourceStatePanel } from "./source-state-panel";
import { GROUP_CHAT_READ_EVENT } from "./use-chat-unread";
import { GroupRequestError, useGroupRequest } from "./use-group-resource";
import styles from "./group-chat-room.module.css";
import roomStyles from "./group-rooms.module.css";

type Item = GroupChat["items"][number];
type Room = { key: string; items: Item[]; canSend: boolean; onlineCount: number; receipts: Map<string, number>; failed: boolean; restricted: boolean };
const NEAR_BOTTOM = 80;

/** 고른 영상의 길이(초). 읽지 못하면 서버 검사에 맡긴다. */
function videoSeconds(file: File) {
  return new Promise<number | null>((resolve) => {
    const url = URL.createObjectURL(file), video = document.createElement("video");
    const done = (value: number | null) => { URL.revokeObjectURL(url); resolve(value); };
    video.preload = "metadata";
    video.onloadedmetadata = () => done(Number.isFinite(video.duration) ? video.duration : null);
    video.onerror = () => done(null);
    video.src = url;
  });
}

function ChatSkeleton({ label }: { label: string }) {
  return <div role="status" aria-busy="true" aria-label={label} className={roomStyles.roomMessagesLoading}>{[0, 1, 2].map((i) => <div className={roomStyles.roomMessage} key={i} aria-hidden="true"><FanSkeleton shape="circle" width={40} height={40} /><div className={roomStyles.roomMessageCopy}><FanSkeleton width={96} height={16} /><FanSkeleton width={i === 1 ? "40%" : "70%"} height={20} /></div></div>)}</div>;
}

/** 보내기 전 첨부 미리보기. 고른 파일을 그대로 보여 주고 올라간 만큼을 적는다. */
function AttachmentPreview({ file, state, failed, retryLabel, removeLabel, disabled, onRetry, onRemove }: { file: File; state: string; failed: boolean; retryLabel: string; removeLabel: string; disabled: boolean; onRetry: () => void; onRemove: () => void }) {
  const [url, setUrl] = useState<string>();
  useEffect(() => { const next = URL.createObjectURL(file); setUrl(next); return () => URL.revokeObjectURL(next); }, [file]);
  return <div className={styles.attachment}>
    {url ? file.type.startsWith("video/") ? <video className={styles.attachmentThumb} src={url} muted playsInline preload="metadata" /> : <img className={styles.attachmentThumb} src={url} alt="" /> : <span className={styles.attachmentThumb} />}
    <FanText role="meta" data-failed={failed || undefined} aria-live="polite">{state}</FanText>
    {failed && <FanAction size="sm" onClick={onRetry}>{retryLabel}</FanAction>}
    <FanIconButton aria-label={removeLabel} disabled={disabled} onClick={onRemove}><FanIcon icon={X} size={20} /></FanIconButton>
  </div>;
}

/**
 * 팬페이지 채팅방의 대화. 3초마다 새 메시지를 읽고, 들어왔을 때 읽은 위치 뒤 첫 메시지 앞에 경계선을 둔다.
 * 맨 아래를 보고 있으면 읽은 위치를 올리고, 내 메시지에는 읽은 사람 수를 적는다. 글 또는 사진·영상 1개를 보낸다.
 */
export function GroupChatRoom({ pageId, locale, onOnlineCount }: { pageId: string; locale: AppLocale; onOnlineCount?: (count: number) => void }) {
  const t = groupsCopy(locale), c = chatCopy(locale), b = boardCopy(locale), k = groupCommentCopy(locale), m = managementCopy(locale), media = mediaCopy[locale];
  const url = `/api/groups/${pageId}/chat`, { request, ready, ownerKey } = useGroupRequest();
  const [room, setRoom] = useState<Room>(), [divider, setDivider] = useState<string | null>(), [fresh, setFresh] = useState(false);
  const [draft, setDraft] = useState(""), [pending, setPending] = useState(false), [sendError, setSendError] = useState<"failed" | "limited">(), [tooLong, setTooLong] = useState(false), [version, setVersion] = useState(0);
  const [removing, setRemoving] = useState<string | null>(null), [reporting, setReporting] = useState<{ id: string; reason: string } | null>(null), [actionBusy, setActionBusy] = useState(false);
  const operation = useRef<{ body: string; assetId?: string; requestId: string } | undefined>(undefined);
  const uploads = useWaveMediaUpload("group_post", 1), upload = uploads.items[0], fileInput = useRef<HTMLInputElement>(null);
  const log = useRef<HTMLDivElement>(null), atBottom = useRef(true), lastSeen = useRef<string | undefined>(undefined), markedRead = useRef<string | undefined>(undefined), placed = useRef(false);
  const notifyOnline = useRef(onOnlineCount);
  useLayoutEffect(() => { notifyOnline.current = onOnlineCount; }, [onOnlineCount]);

  useEffect(() => {
    if (!ready) return;
    let active = true, inFlight = false, cursor: string | undefined, items: Item[] = [], first = true;
    const controller = new AbortController();
    async function load() {
      if (!active || inFlight || document.visibilityState === "hidden") return;
      inFlight = true;
      let more = false;
      try {
        const next = groupChatSchema.parse(await request(`${url}?limit=50${cursor ? `&after=${cursor}` : ""}`, { signal: controller.signal }));
        if (!active) return;
        const gone = new Set(next.removed ?? []), map = new Map(items.filter((item) => !gone.has(item.id)).map((item) => [item.id, item]));
        for (const item of next.items) map.set(item.id, item);
        items = [...map.values()];
        if (next.items.length) cursor = next.items.at(-1)?.id;
        if (first) { first = false; setDivider(next.firstUnreadId ?? null); }
        notifyOnline.current?.(next.onlineCount ?? 0);
        setRoom({ key: ownerKey, items, canSend: next.canSend, onlineCount: next.onlineCount ?? 0, receipts: new Map((next.receipts ?? []).map((receipt) => [receipt.id, receipt.readCount])), failed: false, restricted: false });
        more = next.items.length === 50;
      } catch (error) {
        if (!active) return;
        const restricted = error instanceof GroupRequestError && [401, 403, 404].includes(error.status);
        if (restricted) items = [];
        setRoom((current) => ({ key: ownerKey, items, canSend: restricted ? false : current?.canSend ?? false, onlineCount: current?.onlineCount ?? 0, receipts: current?.receipts ?? new Map(), failed: true, restricted }));
      } finally { inFlight = false; }
      if (more && active) void load();
    }
    void load();
    const timer = setInterval(() => void load(), 3000), visibility = () => { if (document.visibilityState === "visible") void load(); };
    document.addEventListener("visibilitychange", visibility);
    return () => { active = false; controller.abort(); clearInterval(timer); document.removeEventListener("visibilitychange", visibility); };
  }, [ready, request, ownerKey, url, version]);

  const visible = room?.key === ownerKey ? room : undefined, items = visible?.items, last = items?.at(-1);
  const canSend = Boolean(visible && !visible.restricted && visible.canSend);

  // 읽은 위치: 맨 아래를 보고 있을 때만 마지막 메시지까지 올린다.
  const markRead = useCallback((id: string) => {
    if (markedRead.current === id || document.visibilityState === "hidden") return;
    markedRead.current = id;
    void request(url, { method: "POST", body: JSON.stringify({ action: "read", through: id }) })
      .then(() => window.dispatchEvent(new Event(GROUP_CHAT_READ_EVENT)), () => { if (markedRead.current === id) markedRead.current = undefined; });
  }, [request, url]);
  const toBottom = useCallback(() => { const node = log.current; if (node) node.scrollTop = node.scrollHeight; atBottom.current = true; setFresh(false); }, []);

  // 처음에는 읽은 위치(경계선)로, 그 뒤 새 메시지는 맨 아래를 보고 있거나 내가 보낸 것일 때만 따라 내려간다.
  useLayoutEffect(() => {
    const node = log.current;
    if (!node || !last || divider === undefined) return;
    if (!placed.current) {
      placed.current = true;
      const line = divider ? node.querySelector<HTMLElement>("[data-unread-line]") : null;
      if (line) { node.scrollTop = Math.max(0, line.offsetTop - node.offsetTop - 16); atBottom.current = node.scrollHeight - node.scrollTop - node.clientHeight < NEAR_BOTTOM; }
      else toBottom();
    } else if (lastSeen.current !== last.id) {
      if (atBottom.current || last.mine) toBottom(); else setFresh(true);
    }
    lastSeen.current = last.id;
    if (atBottom.current) markRead(last.id);
  }, [last, divider, markRead, toBottom]);

  const onScroll = () => {
    const node = log.current;
    if (!node) return;
    atBottom.current = node.scrollHeight - node.scrollTop - node.clientHeight < NEAR_BOTTOM;
    if (atBottom.current) { if (fresh) setFresh(false); if (last) markRead(last.id); }
  };

  const pick = async (file: File) => {
    if (file.type.startsWith("video/")) { const seconds = await videoSeconds(file); if (seconds !== null && seconds > VIDEO_MAX_SECONDS) { setTooLong(true); return; } }
    setTooLong(false);
    uploads.add([file]);
  };

  const send = async (event: FormEvent) => {
    event.preventDefault();
    if (pending || !canSend || (!draft.trim() && !upload) || Boolean(upload && !uploads.ready)) return;
    const body = draft.trim(), assetId = upload?.media?.assetId;
    if (operation.current?.body !== body || operation.current?.assetId !== assetId) operation.current = { body, ...(assetId ? { assetId } : {}), requestId: crypto.randomUUID() };
    setPending(true);
    try {
      await request(url, { method: "POST", body: JSON.stringify(operation.current) });
      setDraft(""); if (upload) uploads.markUsed(upload.key);
      setSendError(undefined); operation.current = undefined; atBottom.current = true; setVersion((value) => value + 1);
    } catch (error) {
      setSendError(error instanceof GroupRequestError && error.status === 429 ? "limited" : "failed");
      if (error instanceof GroupRequestError && [401, 403, 404].includes(error.status)) {
        if (upload) uploads.remove(upload.key);
        setDraft(""); setRoom({ key: ownerKey, items: [], canSend: false, onlineCount: 0, receipts: new Map(), failed: true, restricted: true });
      }
    } finally { setPending(false); }
  };

  const act = async (body: Record<string, string>, done: () => void) => {
    setActionBusy(true);
    try { await request(url, { method: "POST", body: JSON.stringify(body) }); done(); }
    catch { showFanToast({ title: body.action === "report" ? k.reportFailed : t.error, tone: "error" }); }
    finally { setActionBusy(false); }
  };
  const remove = () => removing && act({ action: "remove", messageId: removing }, () => { setRoom((current) => current && { ...current, items: current.items.filter((item) => item.id !== removing) }); setRemoving(null); setVersion((value) => value + 1); });
  const report = () => reporting?.reason.trim() && act({ action: "report", messageId: reporting.id, reason: reporting.reason.trim() }, () => { setReporting(null); showFanToast({ title: k.reportSent, tone: "success" }); });

  const uploadState = !upload ? "" : upload.failed ? t.error : uploads.ready ? media[3] : `${c.uploading} ${Math.round((upload.progress ?? 0) * 100)}%`;
  return <section className={`${roomStyles.roomConversation} ${styles.room}`}>
    <div className={roomStyles.roomMessages} ref={log} onScroll={onScroll} role="log" aria-label={c.title} aria-live="polite" tabIndex={0}>
      {!visible && <ChatSkeleton label={t.loading} />}
      {visible?.failed && <div role="alert" className={styles.failed}><FanText as="p" role="body">{t.error}</FanText>{!visible.restricted && <FanAction onClick={() => setVersion((value) => value + 1)}>{t.retry}</FanAction>}</div>}
      {visible && !visible.failed && !visible.items.length && <p>{roomEntryCopy(locale).empty}</p>}
      {items?.map((item) => {
        const readCount = item.mine ? visible?.receipts.get(item.id) ?? 0 : 0;
        return <div key={item.id} className={styles.entry}>
          {item.id === divider && <div className={styles.unreadLine} data-unread-line="" role="separator"><FanText role="label">{c.unreadLine}</FanText></div>}
          <div className={`${roomStyles.roomMessage} ${styles.message}`} data-mine={item.mine || undefined} data-artist={item.artist || undefined}>
            {!item.mine && <span className={styles.avatar} data-online={item.online || undefined}>
              <GroupImage locale={locale} src={item.avatarUrl ?? "/images/avatars/star-pink.webp"} alt="" className={roomStyles.roomMessageAvatar} width={40} height={40} />
              {item.online && <span className={styles.onlineDot} role="img" aria-label={c.online} />}
            </span>}
            <div className={roomStyles.roomMessageCopy}>
              {!item.mine && <strong>{item.nickname}{item.artist && <FanTag tone="artist">{c.creator}</FanTag>}</strong>}
              <div className={styles.bubbleRow}>
                <div className={styles.bubble}>
                  {item.body && <p>{item.body}</p>}
                  {item.asset && <div className={styles.media} data-kind={item.asset.kind} style={{ "--chat-media-ratio": `${item.asset.width} / ${item.asset.height}` } as CSSProperties}><AuthenticatedMedia asset={item.asset} play={item.asset.kind === "video"} locale={locale} alt={item.asset.kind === "video" ? media[2] : media[1]} /></div>}
                </div>
                <FanMenu label={c.menu} align={item.mine ? "end" : "start"} trigger={<FanIconButton className={styles.more} aria-label={c.menu}><FanIcon icon={MoreHorizontal} size={20} /></FanIconButton>}>
                  {item.mine ? <FanMenu.Item destructive onSelect={() => setRemoving(item.id)}>{m.remove}</FanMenu.Item> : <FanMenu.Item onSelect={() => setReporting({ id: item.id, reason: "" })}>{b.report}</FanMenu.Item>}
                </FanMenu>
              </div>
              {readCount > 0 && <FanText role="meta" className={styles.read}>{c.read} {readCount.toLocaleString(locale)}</FanText>}
              <time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })}</time>
            </div>
          </div>
        </div>;
      })}
    </div>
    {fresh && <div className={styles.fresh}><FanAction size="sm" onClick={toBottom} leadingIcon={<FanIcon icon={ArrowDown} size={16} />}>{c.newMessages}</FanAction></div>}
    {(uploads.invalid || tooLong) && <FanText as="p" role="meta" className={styles.notice} aria-live="assertive">{c.mediaLimit}</FanText>}
    {sendError && <FanText as="p" role="meta" className={styles.notice} aria-live="assertive">{sendError === "limited" ? c.rateLimited : t.error}</FanText>}
    {visible?.failed && !visible.restricted && !visible.items.length ? null : visible && !canSend ? <SourceStatePanel title={roomStatusCopy(locale).readonly} role="status" /> : visible && <form onSubmit={send} className={`${roomStyles.roomComposer} ${styles.composer}`}>
      {upload && <AttachmentPreview file={upload.file} state={uploadState} failed={Boolean(upload.failed)} retryLabel={t.retry} removeLabel={media[4]} disabled={pending} onRetry={() => uploads.retry(upload)} onRemove={() => uploads.remove(upload.key)} />}
      <FanIconButton aria-label={media[0]} disabled={pending || Boolean(upload)} onClick={() => fileInput.current?.click()}><FanIcon icon={ImagePlus} size={24} /></FanIconButton>
      <input hidden type="file" ref={fileInput} accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime" aria-label={media[0]} onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void pick(file); }} />
      <input className={styles.input} aria-label={roomMessageLabel[locale]} placeholder={roomMessageLabel[locale]} value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={GROUP_CHAT_MAX_LENGTH} disabled={pending} enterKeyHint="send" autoComplete="off" />
      <FanAction type="submit" variant="primary" disabled={pending || (!draft.trim() && !upload) || Boolean(upload && !uploads.ready)}>{sendError ? t.retry : sendLabel[locale]}</FanAction>
    </form>}
    <FanDialog open={removing !== null} onOpenChange={(open) => { if (!open) setRemoving(null); }} alert size="sm" title={c.deleteTitle} closeLabel={fanUiText(locale, "close")} primary={{ label: m.remove, onClick: () => { void remove(); }, loading: actionBusy, variant: "danger" }} secondary={{ label: t.cancel, onClick: () => setRemoving(null) }}>{null}</FanDialog>
    <FanDialog open={reporting !== null} onOpenChange={(open) => { if (!open) setReporting(null); }} size="sm" title={b.report} closeLabel={fanUiText(locale, "close")} primary={{ label: b.report, onClick: () => { void report(); }, loading: actionBusy, disabled: !reporting?.reason.trim() }} secondary={{ label: t.cancel, onClick: () => setReporting(null) }}>
      <label className={detailStyles.commentLabel} htmlFor={`${pageId}-chat-report`}>{b.reason}</label>
      <textarea id={`${pageId}-chat-report`} className={detailStyles.reportReason} value={reporting?.reason ?? ""} onChange={(event) => setReporting((current) => current && { ...current, reason: event.target.value })} maxLength={1000} rows={3} />
    </FanDialog>
  </section>;
}
