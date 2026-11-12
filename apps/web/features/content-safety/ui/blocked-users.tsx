"use client";
import { useState } from "react";
import { z } from "zod";
import { useGroupRequest, useGroupResource } from "@/features/groups/ui/use-group-resource";
import { reachText } from "@/features/group-social/reach-copy";
import { contentCopy } from "@/i18n/catalogs/features__fan_posts__ui";
import type { AppLocale } from "@/i18n/locales";
import styles from "./content.module.css";

/** B6: closed accounts stay in the list without a name or picture, so a block on an account that is gone can still be lifted. */
const blocks = z.object({ profiles: z.array(z.object({ profileId: z.uuid(), closed: z.boolean(), nickname: z.string().nullable(), avatarUrl: z.string().nullable(), blockedAt: z.string() })) });
const parse = (value: unknown) => blocks.parse(value);
export function BlockedUsers({ locale }: { locale: AppLocale }) {
  const copy = contentCopy(locale), auth = useGroupRequest();
  const resource = useGroupResource(auth.authenticated ? "/api/me/social/blocks?fields=closed" : null, parse);
  const [busy, setBusy] = useState<string | null>(null), [failed, setFailed] = useState(false);
  const [removed, setRemoved] = useState<string[]>([]);
  async function remove(id: string) {
    setBusy(id); setFailed(false);
    try { await auth.request(`/api/me/social/blocks/${id}`, { method: "DELETE" }); setRemoved(previous => [...previous, id]); resource.retry(); } catch { setFailed(true); } finally { setBusy(null); }
  }
  const items = resource.data?.profiles.filter(user => !removed.includes(user.profileId));
  return <section className={styles.section}><h2>{copy.block}</h2>
    {items ? items.length ? <ul className={styles.list}>{items.map(user => { const name = user.closed ? reachText(locale, "closedAccount") : user.nickname ?? reachText(locale, "closedAccount"); return <li key={user.profileId} className={`${styles.card} ${styles.row}`}>
      <span className={styles.meta}><img src={user.avatarUrl ?? "/images/avatars/star-pink.webp"} alt="" width={32} height={32} /><strong>{name}</strong></span>
      <button className={styles.button} type="button" disabled={busy !== null} aria-label={`${copy.unblock}: ${name}`} onClick={() => void remove(user.profileId)}>{copy.unblock}</button>
    </li>; })}</ul> : <p className={styles.empty}>{copy.noBlocks}</p> : <p role="status">{resource.error ? copy.failed : copy.loading}{resource.error && <button className={styles.button} onClick={resource.retry}>{copy.retry}</button>}</p>}
    {failed && <p className={styles.error} role="alert">{copy.failed}</p>}
  </section>;
}
