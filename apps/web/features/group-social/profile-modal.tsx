"use client";
import { RewardIcon } from "@/components/fan-ui/reward-icon";
import Link from "../../components/fan-ui/hover-prefetch-link";
import { creatorHomeHref } from "@/features/creator/domain/creator-navigation";
import { useEffect, useId, useRef, useState } from "react";
import { ArrowRight, Ellipsis, Link2, UserRound, X } from "lucide-react";
import { z } from "zod";
import { AccessibleOverlay } from "@/components/ui/overlay/accessible-overlay";
import { FanAction } from "@/components/fan-ui/fan-action";
import { FanSkeleton } from "@/components/fan-ui/fan-skeleton";
import { FanTag } from "@/components/fan-ui/fan-tag";
import { FanNumber } from "@/components/fan-ui/fan-number";
import { socialProfileCardSchema, type SocialProfileCard } from "@/features/fan-profile/domain";
import { fanProfileText } from "@/features/fan-profile/fan-profile-copy";
import { fanSnsIcon, fanSnsLabel } from "@/features/fan-profile/sns-link";
import { levelLabel } from "@/features/passport/domain/passport-read-model";
import { FAN_TIERS, type FanTier } from "@/features/rewards/domain/reward-policy";
import { fanUiText } from "@/components/fan-ui/fan-ui-copy";
import { groupInvitationCopy } from "@/features/groups/ui/group-invitation-copy";
import { GroupRequestError, useGroupRequest, useGroupResource } from "@/features/groups/ui/use-group-resource";
import { fanLoginHref } from "@/components/login-href";
import { contentCopy } from "@/i18n/catalogs/features__fan_posts__ui";
import { encodeProfileRef, profileReturnPath, type ProfileRef } from "./profile-ref";
import { socialCopy } from "./copy";
import { waveFriendsCopy } from "@/i18n/catalogs/features__fanpage__wave-friends";
import type { AppLocale } from "@/i18n/locales";
import { chatDockOwner, openChatDock } from "./chat-dock-store";
import { profileConnectionCopy } from "./profile-copy";
import { dmEnabled, dmReason, dmStateOf, reachSchema } from "./profile-reach";
import { reachText } from "./reach-copy";
import styles from "./profile-modal.module.css";

/** Only what the modal shows is read: name, picture, grade and the public card. Activity and anything private stay out of the component. */
const profileSchema = z.object({
  profile: z.object({ id: z.uuid(), nickname: z.string(), avatarUrl: z.string().nullable(), accountLevel: z.object({ tier: z.string() }).optional() }),
  relationship: z.object({ friendshipId: z.uuid().nullable(), status: z.enum(["none", "incoming", "outgoing", "friends"]) }),
  dm: z.object({ conversationId: z.uuid().nullable(), status: z.string(), canSend: z.boolean() }),
  capabilities: z.object({ canRequestFriend: z.boolean(), canRequestDm: z.boolean(), canBlock: z.boolean() }),
  isSelf: z.boolean(),
  reach: reachSchema,
  // Older servers answer without it; a card that breaks the contract is null too, and the numbers show their error.
  card: socialProfileCardSchema.nullable().optional().catch(null),
});
/** Signed out the server sends the public card only: name, picture, level and the card. */
const publicSchema = z.object({
  profile: z.object({ nickname: z.string(), avatarUrl: z.string().nullable(), accountLevel: z.object({ tier: z.string() }).optional() }),
  card: socialProfileCardSchema.nullable().optional().catch(null),
});
type SignedIn = z.infer<typeof profileSchema>;
type Answer = { signedIn: SignedIn } | { signedOut: z.infer<typeof publicSchema> };
const parse = (value: unknown): Answer => { const signedIn = profileSchema.safeParse(value); return signedIn.success ? { signedIn: signedIn.data } : { signedOut: publicSchema.parse(value) }; };
const REASONS = ["spam", "harassment", "sexual", "hate", "other"] as const;
const reasonKey = { spam: "reasonSpam", harassment: "reasonHarassment", sexual: "reasonSexual", hate: "reasonHate", other: "reasonOther" } as const;

/** `pageId`: the page the card was opened from, so the numbers are that page's. Without it, the fan's chosen favorite's. */
/** `ref`: opened from content ("the author of this post"), which also works signed out. Without it, from a member id (signed in only). */
export type ProfileModalPerson = { profileId?: string; ref?: ProfileRef; nickname: string; avatarUrl: string | null; tier?: string | null; pageId?: string };

/** Hearts, points and stamps: label above, number below, a line between cells. Fixed height while loading. */
function ProfileStats({ card, loading, locale }: { card: SocialProfileCard | null | undefined; loading: boolean; locale: AppLocale }) {
  if (loading) return <div className={styles.stats} aria-busy="true">{[0, 1, 2].map(index => <div key={index} className={styles.stat}><FanSkeleton width={40} height={16}/><FanSkeleton width={56} height={24}/></div>)}</div>;
  if (card === null) return <p className={styles.statsError} role="status">{fanProfileText(locale, "profStatsFailed")}</p>;
  const stats = card?.stats;
  if (!stats) return null;
  return <dl className={styles.stats}>
    <div className={styles.stat}><dt>{fanProfileText(locale, "profHearts")}</dt><dd><FanNumber value={stats.hearts} size="lg" locale={locale} icon={<RewardIcon kind="heart" alt="" width={20} height={20}/>}/></dd></div>
    <div className={styles.stat}><dt>{fanProfileText(locale, "profPoints")}</dt><dd><FanNumber value={stats.points} size="lg" locale={locale} unit="P"/></dd></div>
    <div className={styles.stat}><dt>{fanProfileText(locale, "profStamps")}</dt><dd><FanNumber value={stats.stamps} size="lg" locale={locale}/></dd></div>
  </dl>;
}

/** Opens over the page instead of leaving it. Signed out it shows the public card, and Add friend or Message lead to sign-in and back to this window. */
export function ProfileModal({ person, locale, onClose }: { person: ProfileModalPerson; locale: AppLocale; onClose: () => void }) {
  const title = useId(), reasonId = useId(), detailsId = useId();
  const apiLocale = locale === "ko" ? "ko" : "en";
  const auth = useGroupRequest();
  const path = person.ref ? `/api/profiles/by-ref?ref=${encodeProfileRef(person.ref)}&locale=${apiLocale}` : person.profileId ? `/api/me/social/profiles/${person.profileId}?locale=${apiLocale}${person.pageId ? `&pageId=${person.pageId}` : ""}` : null;
  const r = useGroupResource(auth.ready ? path : null, parse);
  const t = waveFriendsCopy(locale), c = contentCopy(locale), s = socialCopy(locale);
  const [pending, setPending] = useState(false), [failed, setFailed] = useState<string>();
  const [view, setView] = useState<"profile" | "block" | "report">("profile"), [menuOpen, setMenuOpen] = useState(false);
  const [reason, setReason] = useState<(typeof REASONS)[number]>(), [details, setDetails] = useState(""), [sent, setSent] = useState(false);
  const attempt = useRef<string | null>(null), active = useRef(true), closeRef = useRef<HTMLElement | null>(null);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);

  const d = r.data && "signedIn" in r.data ? r.data.signedIn : undefined;
  const publicCard = r.data && "signedOut" in r.data ? r.data.signedOut : undefined;
  const guest = auth.ready && !auth.authenticated;
  // A closed profile answers 404 or 403: blocked, sanctioned and gone must look the same.
  const closed = r.error && (r.failure?.status === 404 || r.failure?.status === 403);
  const shown = d ?? publicCard;
  const nickname = shown?.profile.nickname ?? person.nickname, avatarUrl = shown?.profile.avatarUrl ?? person.avatarUrl;
  // The row gives the grade on this page, which is what the viewer just read. Elsewhere the account grade.
  const grade = closed ? null : person.tier ?? shown?.card?.stats?.tier ?? shown?.profile.accountLevel?.tier;
  // The tier name in the viewer's language, as on the row ("Silver" → "실버").
  const gradeLabel = grade && (FAN_TIERS as readonly string[]).includes(grade) ? levelLabel(locale, grade as FanTier) : grade;
  const card = closed ? undefined : shown?.card;
  const favorite = card?.favorite ? fanProfileText(locale, "profFavorite", [card.favorite.name]) : null;
  const dmState = closed ? "blocked" : d ? dmStateOf(d) : undefined;
  const canModerate = Boolean(d && !closed && dmState !== "self");
  const dmReasonText = dmState ? dmReason(locale, dmState) : null;

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
  /** Signed out: a short-lived ref to this person, so the same window opens after sign-in. */
  async function signInFirst() {
    if (!person.ref || pending) return;
    setPending(true); setFailed(undefined);
    try {
      const answer = z.object({ returnRef: z.uuid() }).parse(await auth.request("/api/profiles/return-ref", { method: "POST", body: JSON.stringify({ ref: person.ref }) }));
      window.location.assign(fanLoginHref(locale, profileReturnPath(answer.returnRef)));
    } catch { if (active.current) { setFailed(t.error); setPending(false); } }
  }
  async function block() {
    if (!d || pending) return;
    attempt.current ??= crypto.randomUUID();
    setPending(true); setFailed(undefined);
    try {
      await auth.request("/api/me/social/blocks", { method: "POST", body: JSON.stringify({ profileId: d.profile.id, requestId: attempt.current }) });
      attempt.current = null;
      if (active.current) { setView("profile"); r.retry(); }
    } catch { if (active.current) setFailed(t.error); }
    finally { if (active.current) setPending(false); }
  }
  async function report() {
    if (!d || !reason || pending) return;
    attempt.current ??= crypto.randomUUID();
    setPending(true); setFailed(undefined);
    try {
      const text = details.trim();
      await auth.request("/api/me/social/profiles/report", { method: "POST", body: JSON.stringify({ ref: person.ref ?? { kind: "profile", profileId: d.profile.id }, reason, ...(text ? { details: text } : {}), requestId: attempt.current }) });
      attempt.current = null;
      if (active.current) { setView("profile"); setSent(true); setReason(undefined); setDetails(""); }
    } catch (error) { if (active.current) setFailed(error instanceof GroupRequestError && error.status === 429 ? groupInvitationCopy(locale).limited : t.error); }
    finally { if (active.current) setPending(false); }
  }
  function startChat() {
    if (!d) return;
    onClose();
    openChatDock({ owner: chatDockOwner(r.ownerKey), profileId: d.profile.id, nickname: d.profile.nickname, avatarUrl: d.profile.avatarUrl, conversationId: d.dm.conversationId });
  }

  const friendButton = () => {
    if (guest) return publicCard ? <FanAction disabled={pending} ariaBusy={pending} onClick={() => void signInFirst()}>{t.add}</FanAction> : null;
    if (!d) return null;
    if (d.relationship.status === "friends") return <FanAction disabled>{t.title}</FanAction>;
    if (d.relationship.status === "outgoing") return <FanAction disabled>{t.pending}</FanAction>;
    if (d.relationship.status === "incoming") return <FanAction disabled={pending} ariaBusy={pending} onClick={() => void friendAction()}>{reachText(locale, "acceptFriend")}</FanAction>;
    return d.capabilities.canRequestFriend ? <FanAction disabled={pending} ariaBusy={pending} onClick={() => void friendAction()}>{t.add}</FanAction> : null;
  };

  return <AccessibleOverlay open onClose={onClose} labelledBy={title} backdropClassName={styles.backdrop} contentClassName={`${styles.panel}${person.ref?.kind === "home_ranking" ? ` ${styles.rankingPanel}` : ""}`} contentAs="section" initialFocusRef={closeRef}>
    <div className={styles.handle} aria-hidden="true"/>
    <header className={styles.header}>
      {avatarUrl ? <img src={avatarUrl} alt="" width={72} height={72} className={styles.avatar}/> : <span className={styles.avatar}><UserRound size={36} aria-hidden="true"/></span>}
      <div className={styles.identity}>
        <div className={styles.nameLine}>
          <h2 id={title}>{nickname || <FanSkeleton width={96} height={24}/>}</h2>
          {d?.reach?.artist && <FanTag tone="artist">{fanUiText(locale, "artistTag")}</FanTag>}
        </div>
        {r.loading && !grade ? <FanSkeleton width={72} height={16}/> : (gradeLabel || favorite) && <p className={styles.grade}>{[gradeLabel, favorite].filter(Boolean).join(" · ")}</p>}
      </div>
      {canModerate && view === "profile" && <FanAction variant="text" className={styles.close} ariaLabel={c.more} aria-expanded={menuOpen} onClick={() => setMenuOpen(value => !value)} leadingIcon={<Ellipsis size={20} aria-hidden="true"/>}/>}
      <span className={styles.closeSlot} ref={slot => { closeRef.current = slot?.querySelector("button") ?? null; }}><FanAction variant="text" className={styles.close} onClick={onClose} ariaLabel={profileConnectionCopy(locale).close} leadingIcon={<X size={20} aria-hidden="true"/>}/></span>
    </header>
    {menuOpen && canModerate && view === "profile" && <div className={styles.menu}>
      <FanAction variant="text" onClick={() => { setMenuOpen(false); setSent(false); setView("report"); }}>{c.report}</FanAction>
      <FanAction variant="text" className={styles.destructive} onClick={() => { setMenuOpen(false); setView("block"); }}>{s.block}</FanAction>
    </div>}
    {view === "block" && <div className={styles.sheet}>
      <p className={styles.bio}>{reachText(locale, "blockProfileConfirm")}</p>
      <div className={styles.actions}><FanAction disabled={pending} onClick={() => setView("profile")}>{c.cancel}</FanAction><FanAction variant="danger" disabled={pending} ariaBusy={pending} onClick={() => void block()}>{s.block}</FanAction></div>
      {failed && <p className={styles.error} role="alert">{failed}</p>}
    </div>}
    {view === "report" && <form className={styles.sheet} onSubmit={event => { event.preventDefault(); void report(); }}>
      <fieldset className={styles.reasons}><legend>{reachText(locale, "reportProfile")}</legend>
        {REASONS.map(item => <label key={item} className={styles.reasonOption}><input type="radio" name="profile-report-reason" value={item} checked={reason === item} disabled={pending} onChange={() => setReason(item)}/>{reachText(locale, reasonKey[item])}</label>)}
      </fieldset>
      <label className={styles.detailsField} htmlFor={detailsId}>{reachText(locale, "reportDetails")}<textarea id={detailsId} rows={3} maxLength={500} value={details} disabled={pending} onChange={event => setDetails(event.target.value)}/></label>
      <div className={styles.actions}><FanAction disabled={pending} onClick={() => setView("profile")}>{c.cancel}</FanAction><FanAction type="submit" variant="danger" disabled={pending || !reason} ariaBusy={pending}>{c.report}</FanAction></div>
      {failed && <p className={styles.error} role="alert">{failed}</p>}
    </form>}
    {view === "profile" && <>
    {sent && <p className={styles.reason} role="status">{c.reportSent}</p>}
    {!closed && !r.error && <ProfileStats card={card} loading={r.loading && !shown} locale={locale}/>}
    {card && card.links.length > 0 && <ul className={styles.links} aria-label={fanProfileText(locale, "profLinks")}>{card.links.map(link => {
      const icon = fanSnsIcon(link), label = fanSnsLabel(link);
      return <li key={link}><a href={link} target="_blank" rel="noopener noreferrer nofollow ugc" aria-label={label} title={label} data-outbound-placement="content" data-outbound-kind="social">{icon ? <img src={icon} width={20} height={20} alt=""/> : <Link2 size={20} aria-hidden="true"/>}</a></li>;
    })}</ul>}
    {person.ref?.kind === "home_ranking" && card?.stats?.creator ? <Link className={styles.grade} href={creatorHomeHref(card.stats.creator.slug, locale)}>{card.stats.creator.name} <span aria-hidden="true">›</span></Link> : null}
    {card?.bio && <p className={styles.bio}>{card.bio}</p>}
    {closed ? <p className={styles.reason} role="status">{s.cannotSend}</p>
      : r.error ? <div className={styles.failure} role="alert"><p>{t.error}</p><FanAction onClick={r.retry}>{t.retry}</FanAction></div>
      : dmState === "self" ? <FanAction className={styles.editProfile} href={`/settings?locale=${locale}&section=profile`} trailingIcon={<ArrowRight size={18} aria-hidden="true"/>}>{fanProfileText(locale, "profEdit")}</FanAction>
      : <div className={styles.actionsArea}>
        <div className={styles.actions} aria-busy={r.loading || undefined}>
          {r.loading ? <><FanSkeleton shape="block" height={44}/><FanSkeleton shape="block" height={44}/></> : <>
            {friendButton()}
            <FanAction variant="primary" disabled={guest ? !publicCard || pending : !dmState || !dmEnabled(dmState)} ariaDescribedBy={!guest && dmReasonText ? reasonId : undefined} onClick={guest ? () => void signInFirst() : startChat}>{t.dm}</FanAction>
          </>}
        </div>
        {dmReasonText && <p id={reasonId} className={styles.reason}>{dmReasonText}</p>}
        {failed && <p className={styles.error} role="alert">{failed}</p>}
      </div>}
    </>}
  </AccessibleOverlay>;
}
