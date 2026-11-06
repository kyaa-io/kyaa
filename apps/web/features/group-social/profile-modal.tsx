"use client";
import { useEffect, useId, useRef, useState } from "react";
import { UserRound, X } from "lucide-react";
import { z } from "zod";
import { AccessibleOverlay } from "@/components/ui/overlay/accessible-overlay";
import { FanAction } from "@/components/fan-ui/fan-action";
import { FanSkeleton } from "@/components/fan-ui/fan-skeleton";
import { FanTag } from "@/components/fan-ui/fan-tag";
import { fanUiText } from "@/components/fan-ui/fan-ui-copy";
import { groupInvitationCopy } from "@/features/groups/ui/group-invitation-copy";
import { GroupRequestError, useGroupResource } from "@/features/groups/ui/use-group-resource";
import { waveFriendsCopy } from "@/i18n/catalogs/features__fanpage__wave-friends";
import type { AppLocale } from "@/i18n/locales";
import { chatDockOwner, openChatDock } from "./chat-dock-store";
import { profileConnectionCopy } from "./profile-copy";
import { dmEnabled, dmReason, dmStateOf, reachSchema } from "./profile-reach";
import { reachText } from "./reach-copy";
import styles from "./profile-modal.module.css";

/** Only what the modal shows is read: name, picture and grade. Activity, favorites and anything private stay out of the component. */
const profileSchema = z.object({
  profile: z.object({ id: z.uuid(), nickname: z.string(), avatarUrl: z.string().nullable(), accountLevel: z.object({ tier: z.string() }).optional() }),
  relationship: z.object({ friendshipId: z.uuid().nullable(), status: z.enum(["none", "incoming", "outgoing", "friends"]) }),
  dm: z.object({ conversationId: z.uuid().nullable(), status: z.string(), canSend: z.boolean() }),
  capabilities: z.object({ canRequestFriend: z.boolean(), canRequestDm: z.boolean(), canBlock: z.boolean() }),
  isSelf: z.boolean(),
  reach: reachSchema,
});
const parse = (value: unknown) => profileSchema.parse(value);

export type ProfileModalPerson = { profileId: string; nickname: string; avatarUrl: string | null };

/** Opens over the page instead of leaving it. Signed-out rows cannot open it, so its actions are always for someone signed in. */
export function ProfileModal({ person, locale, onClose }: { person: ProfileModalPerson; locale: AppLocale; onClose: () => void }) {
  const title = useId(), reasonId = useId();
  const r = useGroupResource(`/api/me/social/profiles/${person.profileId}?locale=${locale === "ko" ? "ko" : "en"}`, parse);
  const t = waveFriendsCopy(locale);
  const [pending, setPending] = useState(false), [failed, setFailed] = useState<string>();
  const attempt = useRef<string | null>(null), active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);

  const d = r.data;
  // A closed profile answers 404 or 403: blocked, sanctioned and gone must look the same.
  const closed = r.error && (r.failure?.status === 404 || r.failure?.status === 403);
  const nickname = d?.profile.nickname ?? person.nickname, avatarUrl = d?.profile.avatarUrl ?? person.avatarUrl;
  const dmState = closed ? "blocked" : d ? dmStateOf(d) : undefined;
  const reason = dmState ? dmReason(locale, dmState) : null;

  async function friendAction() {
    if (!d || pending) return;
    const incoming = d.relationship.status === "incoming" && d.relationship.friendshipId;
    attempt.current ??= crypto.randomUUID();
    setPending(true); setFailed(undefined);
    try {
      await r.request(incoming ? `/api/me/social/friends/${d.relationship.friendshipId}` : "/api/me/social/friends", { method: incoming ? "PATCH" : "POST", body: JSON.stringify({ ...(incoming ? { action: "accept" } : { profileId: d.profile.id }), requestId: attempt.current }) });
      attempt.current = null;
      if (active.current) r.retry();
    } catch (error) {
      if (active.current) setFailed(error instanceof GroupRequestError && error.status === 429 ? groupInvitationCopy(locale).limited : t.error);
    } finally { if (active.current) setPending(false); }
  }
  function startChat() {
    if (!d) return;
    onClose();
    openChatDock({ owner: chatDockOwner(r.ownerKey), profileId: d.profile.id, nickname: d.profile.nickname, avatarUrl: d.profile.avatarUrl, conversationId: d.dm.conversationId });
  }

  const friendButton = () => {
    if (!d) return null;
    if (d.relationship.status === "friends") return <FanAction disabled>{t.title}</FanAction>;
    if (d.relationship.status === "outgoing") return <FanAction disabled>{t.pending}</FanAction>;
    if (d.relationship.status === "incoming") return <FanAction disabled={pending} ariaBusy={pending} onClick={() => void friendAction()}>{reachText(locale, "acceptFriend")}</FanAction>;
    return d.capabilities.canRequestFriend ? <FanAction disabled={pending} ariaBusy={pending} onClick={() => void friendAction()}>{t.add}</FanAction> : null;
  };

  return <AccessibleOverlay open onClose={onClose} labelledBy={title} backdropClassName={styles.backdrop} contentClassName={styles.panel} contentAs="section">
    <div className={styles.handle} aria-hidden="true"/>
    <header className={styles.header}>
      {avatarUrl ? <img src={avatarUrl} alt="" width={72} height={72} className={styles.avatar}/> : <span className={styles.avatar}><UserRound size={36} aria-hidden="true"/></span>}
      <div className={styles.identity}>
        <div className={styles.nameLine}>
          <h2 id={title}>{nickname}</h2>
          {d?.reach?.artist && <FanTag tone="artist">{fanUiText(locale, "artistTag")}</FanTag>}
        </div>
        {r.loading ? <FanSkeleton width={72} height={16}/> : d?.profile.accountLevel && <p className={styles.grade}>{d.profile.accountLevel.tier}</p>}
      </div>
      <FanAction variant="text" className={styles.close} onClick={onClose} ariaLabel={profileConnectionCopy(locale).close} leadingIcon={<X size={20} aria-hidden="true"/>}/>
    </header>
    {r.error && !closed
      ? <div className={styles.failure} role="alert"><p>{t.error}</p><FanAction onClick={r.retry}>{t.retry}</FanAction></div>
      : dmState === "self" ? null
      : <div className={styles.actionsArea}>
        <div className={styles.actions} aria-busy={r.loading || undefined}>
          {r.loading ? <><FanSkeleton shape="block" height={44}/><FanSkeleton shape="block" height={44}/></> : <>
            {friendButton()}
            <FanAction variant="primary" disabled={!dmState || !dmEnabled(dmState)} ariaDescribedBy={reason ? reasonId : undefined} onClick={startChat}>{t.dm}</FanAction>
          </>}
        </div>
        {reason && <p id={reasonId} className={styles.reason}>{reason}</p>}
        {failed && <p className={styles.error} role="alert">{failed}</p>}
      </div>}
  </AccessibleOverlay>;
}
