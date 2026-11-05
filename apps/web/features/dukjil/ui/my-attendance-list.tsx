"use client";
import { useState } from "react";
import { FanAction } from "@/components/fan-ui/fan-action";
import { groupListSchema, groupHref, type GroupPage } from "@/features/groups/domain/contracts";
import { GroupImage } from "@/features/groups/ui/group-image";
import { useGroupRequest, useGroupResource } from "@/features/groups/ui/use-group-resource";
import { walletCopy } from "@/features/group-wallet/ui/copy";
import { parseDukjilAttendanceList, type DukjilAttendanceList } from "../domain/dukjil-ui";
import type { AppLocale } from "@/i18n/locales";
import { CreatorAttendanceDialog } from "./creator-attendance-dialog";
import { dukjilText } from "./dukjil-copy";
import { DukjilProvider } from "./dukjil-provider";
import { EarnBadge } from "./earn-badge";
import styles from "./dukjil.module.css";

const parseList = (value: unknown) => groupListSchema.parse(value);
type Creator = GroupPage & { slug: string };

/** Attendance status of every joined creator page (plan §13.5). The page list comes from the joined list; all states from one `GET /api/me/attendance?creators=`. Renders only under an active policy. */
export function MyAttendanceList({ locale }: { locale: AppLocale }) {
  const auth = useGroupRequest();
  const list = useGroupResource(auth.authenticated ? "/api/groups?mine=joined&limit=50" : null, parseList);
  const creators = (list.data?.items ?? []).filter((page): page is Creator => Boolean(page.celebrityId && page.slug)).slice(0, 50);
  const slugs = creators.map(page => encodeURIComponent(page.slug)).join(",");
  const status = useGroupResource(slugs ? `/api/me/attendance?creators=${slugs}` : null, parseDukjilAttendanceList);
  const c = walletCopy(locale);
  if (!auth.ready || list.loading || (slugs && status.loading)) return <p className={styles.state} role="status">{c.loading}</p>;
  if (!auth.authenticated) return <FanAction variant="primary" href={`/login?locale=${locale}&returnTo=${encodeURIComponent(`/my/wallet?view=attendance&locale=${locale}`)}`}>{c.login}</FanAction>;
  if (list.error || !list.data || (slugs && (status.error || !status.data))) return <div className={styles.state} role="alert"><span>{dukjilText(locale, "dukjilLoadError")}</span><FanAction onClick={() => { list.retry(); status.retry(); }}>{dukjilText(locale, "dukjilCheckInShort")}</FanAction></div>;
  if (creators.length === 0) return <p className={styles.state}>{dukjilText(locale, "dukjilListEmpty")}</p>;
  const byId = new Map(status.data?.items.map(item => [item.celebrityId, item]));
  return (
    <section aria-label={dukjilText(locale, "dukjilListTitle")}>
      <ul className={styles.rows}>{creators.map(page => <li key={page.id} className={styles.row}><Row page={page} locale={locale} item={byId.get(page.celebrityId!)} onChanged={() => status.retry()} /></li>)}</ul>
    </section>
  );
}

function Row({ page, locale, item, onChanged }: { page: Creator; locale: AppLocale; item: DukjilAttendanceList["items"][number] | undefined; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      {page.imageUrl ? <GroupImage locale={locale} src={page.imageUrl} alt="" width={44} height={44} className={styles.rowImage} /> : <span className={styles.rowImage} aria-hidden="true" />}
      <span className={styles.rowText}>
        <strong>{page.name}</strong>
        {item && item.streak > 0 && <small>{dukjilText(locale, "dukjilStreak", [item.streak])}</small>}
      </span>
      {item?.attendedToday ? <EarnBadge variant="done" locale={locale} /> : item && !item.hasPassport
        ? <FanAction className={styles.rowAction} href={groupHref(page, locale)}>{dukjilText(locale, "dukjilReview")}</FanAction>
        : <FanAction className={styles.rowAction} onClick={() => setOpen(true)}>{dukjilText(locale, "dukjilCheckInShort")}</FanAction>}
      {open && <DukjilProvider slug={page.slug} locale={locale} hasPassport={item?.hasPassport}><CreatorAttendanceDialog open reviewHref={groupHref(page, locale)} onClose={() => { setOpen(false); onChanged(); }} /></DukjilProvider>}
    </>
  );
}
