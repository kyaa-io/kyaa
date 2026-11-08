"use client";
import { useEffect, useId, useState } from "react";
import { Plus, X } from "lucide-react";
import { FanAction } from "@/components/fan-ui/fan-action";
import { FanSkeleton } from "@/components/fan-ui/fan-skeleton";
import { showFanToast } from "@/components/fan-ui/fan-toast";
import { GroupRequestError, useGroupResource } from "@/features/groups/ui/use-group-resource";
import type { AppLocale } from "@/i18n/locales";
import { ownedFanProfilePublicSchema, type OwnedFanProfilePublic } from "../domain";
import { fanProfileText } from "../fan-profile-copy";
import { FAN_BIO_MAX, FAN_SNS_LINKS_MAX, parseFanBio, parseFanSnsUrl } from "../sns-link";
import styles from "./profile-public-fields.module.css";

const parse = (value: unknown) => ownedFanProfilePublicSchema.parse(value);
type Draft = { favoriteSlug: string; bio: string; links: string[] };
const draftOf = (value: OwnedFanProfilePublic): Draft => ({ favoriteSlug: value.favorite?.slug ?? "", bio: value.bio ?? "", links: value.links.length ? [...value.links] : [""] });
const same = (a: Draft, b: Draft) => a.favoriteSlug === b.favoriteSlug && a.bio.trim() === b.bio.trim() && JSON.stringify(a.links.map(l => l.trim()).filter(Boolean)) === JSON.stringify(b.links.map(l => l.trim()).filter(Boolean));

/** Favorite, one-line intro and up to three SNS links (261107-2 C2). All start empty; other fans see only what is written here. */
export function ProfilePublicFields({ locale }: { locale: AppLocale }) {
  const r = useGroupResource(`/api/me/social/profile-fields?locale=${locale === "ko" ? "ko" : "en"}`, parse);
  const [draft, setDraft] = useState<Draft | null>(null), [saved, setSaved] = useState<Draft | null>(null);
  const [pending, setPending] = useState(false), [failed, setFailed] = useState(false);
  const ids = { favorite: useId(), bio: useId(), bioCount: useId(), links: useId(), linkError: useId() };
  // Keyed by content, not identity: a re-read with the same values must not reset what the fan is typing.
  const loadedKey = r.data ? JSON.stringify(draftOf(r.data)) : null;
  useEffect(() => {
    if (!loadedKey) return;
    const next = JSON.parse(loadedKey) as Draft;
    setSaved(previous => {
      setDraft(current => current && previous && !same(current, previous) ? current : next);
      return next;
    });
  }, [loadedKey]);

  if (r.error) return <div className={styles.fields} role="alert"><p className={styles.error}>{fanProfileText(locale, "profSaveFailed")}</p><FanAction onClick={r.retry}>{fanProfileText(locale, "profSave")}</FanAction></div>;
  if (!draft || !r.data) return <div className={styles.fields} aria-busy="true"><FanSkeleton shape="block" height={50}/><FanSkeleton shape="block" height={50}/><FanSkeleton shape="block" height={50}/></div>;

  const bioLength = [...draft.bio.trim()].length;
  const bioInvalid = parseFanBio(draft.bio) === undefined;
  const badLinks = draft.links.map(link => link.trim() !== "" && parseFanSnsUrl(link) === null);
  const invalid = bioInvalid || badLinks.some(Boolean);
  const unchanged = saved !== null && same(draft, saved);
  const setLink = (index: number, value: string) => setDraft({ ...draft, links: draft.links.map((link, i) => i === index ? value : link) });

  async function save() {
    if (!draft || invalid || pending) return;
    setPending(true); setFailed(false);
    try {
      const body = { favoriteSlug: draft.favoriteSlug || null, bio: draft.bio.trim() || null, links: draft.links.map(link => link.trim()).filter(Boolean) };
      const result = parse(await r.request(`/api/me/social/profile-fields?locale=${locale === "ko" ? "ko" : "en"}`, { method: "PUT", body: JSON.stringify(body) }));
      const next = draftOf(result); setSaved(next); setDraft(next);
      showFanToast({ title: fanProfileText(locale, "profSaved"), tone: "success" });
    } catch (error) {
      setFailed(!(error instanceof GroupRequestError && error.status === 409 && error.code === "SESSION_CHANGED"));
    } finally { setPending(false); }
  }

  return <form className={styles.fields} onSubmit={event => { event.preventDefault(); void save(); }}>
    <label className={styles.field} htmlFor={ids.favorite}><span className={styles.label}>{fanProfileText(locale, "profFavoriteLabel")}</span>
      <select id={ids.favorite} className={styles.control} value={draft.favoriteSlug} disabled={pending} onChange={event => setDraft({ ...draft, favoriteSlug: event.target.value })}>
        <option value="">{fanProfileText(locale, "profFavoriteNone")}</option>
        {r.data.favoriteOptions.map(option => <option key={option.slug} value={option.slug}>{option.name}</option>)}
      </select>
    </label>
    <div className={styles.field}>
      <span className={styles.labelRow}><label className={styles.label} htmlFor={ids.bio}>{fanProfileText(locale, "profBio")}</label><small id={ids.bioCount} className={styles.count} data-over={bioInvalid || undefined}>{bioLength}/{FAN_BIO_MAX}</small></span>
      <input id={ids.bio} className={styles.control} value={draft.bio} disabled={pending} maxLength={FAN_BIO_MAX * 2} aria-invalid={bioInvalid || undefined} aria-describedby={ids.bioCount} dir="auto" onChange={event => setDraft({ ...draft, bio: event.target.value.replace(/[\r\n]/g, " ") })}/>
    </div>
    <fieldset className={styles.field} aria-describedby={badLinks.some(Boolean) ? ids.linkError : undefined}>
      <legend className={styles.label} id={ids.links}>{fanProfileText(locale, "profLinks")}</legend>
      {draft.links.map((link, index) => <div key={index} className={styles.linkRow}>
        <input className={styles.control} type="url" inputMode="url" autoComplete="url" placeholder="https://" value={link} disabled={pending} aria-label={fanProfileText(locale, "profLinkLabel", [index + 1])} aria-invalid={badLinks[index] || undefined} onChange={event => setLink(index, event.target.value)}/>
        {(draft.links.length > 1 || link) && <FanAction variant="text" className={styles.remove} disabled={pending} ariaLabel={fanProfileText(locale, "profLinkRemove")} leadingIcon={<X size={18} aria-hidden="true"/>} onClick={() => setDraft({ ...draft, links: draft.links.length > 1 ? draft.links.filter((_, i) => i !== index) : [""] })}/>}
      </div>)}
      {badLinks.some(Boolean) && <small id={ids.linkError} className={styles.error} role="alert">{fanProfileText(locale, "profLinkInvalid")}</small>}
      {draft.links.length < FAN_SNS_LINKS_MAX && <FanAction variant="text" className={styles.add} disabled={pending} leadingIcon={<Plus size={18} aria-hidden="true"/>} onClick={() => setDraft({ ...draft, links: [...draft.links, ""] })}>{fanProfileText(locale, "profLinkAdd")}</FanAction>}
    </fieldset>
    {failed && <p className={styles.error} role="alert">{fanProfileText(locale, "profSaveFailed")}</p>}
    <FanAction type="submit" variant="primary" className={styles.save} disabled={pending || invalid || unchanged} ariaBusy={pending}>{fanProfileText(locale, "profSave")}</FanAction>
  </form>;
}
