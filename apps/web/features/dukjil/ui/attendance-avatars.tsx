"use client";
import { useState } from "react";
import { FanAction } from "@/components/fan-ui/fan-action";
import { FanIcon } from "@/components/fan-ui/fan-icon";
import { Check } from "@/components/fan-ui/fan-icons";
import { FanTooltip } from "@/components/fan-ui/fan-tooltip";
import type { GroupPage } from "@/features/groups/domain/contracts";
import { GroupImage } from "@/features/groups/ui/group-image";
import type { AppLocale } from "@/i18n/locales";
import type { DukjilAttendanceList } from "../domain/dukjil-ui";
import { CreatorAttendanceDialog } from "./creator-attendance-dialog";
import { dukjilText } from "./dukjil-copy";
import { DukjilProvider } from "./dukjil-provider";
import dukjilStyles from "./dukjil.module.css";
import styles from "./attendance-avatars.module.css";

type Creator = GroupPage & { slug: string };
type Item = DukjilAttendanceList["items"][number] | undefined;

/** "내 페이지 출석 현황" (feedback #17): round avatars, a green ring and check once checked in today, the name on hover / long press,
 * `연속 N일` under each avatar, and a check-in button only where today is still open. */
export function AttendanceAvatars({ locale, creators, byId, verifyHref, onChanged }: {
  locale: AppLocale; creators: Creator[]; byId: ReadonlyMap<string, NonNullable<Item>>; verifyHref: (page: Creator) => string; onChanged: () => void;
}) {
  return <ul className={styles.list}>{creators.map(page => <AvatarItem key={page.id} page={page} locale={locale} item={byId.get(page.celebrityId!)} reviewHref={verifyHref(page)} onChanged={onChanged} />)}</ul>;
}

function AvatarItem({ page, locale, item, reviewHref, onChanged }: { page: Creator; locale: AppLocale; item: Item; reviewHref: string; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const attended = Boolean(item?.attendedToday);
  return (
    <li className={styles.item} data-row="">
      <FanTooltip content={page.name} side="top" delay={150} longPress>
        <span className={styles.avatar} role="img" aria-label={page.name} tabIndex={0} data-attended={attended ? "true" : "false"}>
          {page.imageUrl ? <GroupImage locale={locale} src={page.imageUrl} alt="" width={62} height={62} className={styles.image} /> : <span className={styles.image} aria-hidden="true" />}
          {attended && <span className={styles.check} aria-hidden="true"><FanIcon icon={Check} size={16} /></span>}
        </span>
      </FanTooltip>
      {attended && <span className={dukjilStyles.srOnly}>{dukjilText(locale, "dukjilBadgeDone")}</span>}
      <small className={styles.streak}>{item && item.streak > 0 ? dukjilText(locale, "dukjilStreak", [item.streak]) : null}</small>
      {!attended && (item && !item.hasPassport
        ? <FanAction className={styles.action} href={reviewHref}>{dukjilText(locale, "dukjilReview")}</FanAction>
        : <FanAction className={styles.action} onClick={() => setOpen(true)}>{dukjilText(locale, "dukjilCheckInShort")}</FanAction>)}
      {open && <DukjilProvider slug={page.slug} locale={locale} hasPassport={item?.hasPassport}><CreatorAttendanceDialog open pageName={page.name} reviewHref={reviewHref} onClose={() => { setOpen(false); onChanged(); }} /></DukjilProvider>}
    </li>
  );
}
