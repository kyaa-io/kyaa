"use client";
import { useState } from "react";
import { FanActivityStamp } from "@/components/fan-ui/fan-activity-stamp";
import { FanAction } from "@/components/fan-ui/fan-action";
import { FanIcon } from "@/components/fan-ui/fan-icon";
import { FanNumber } from "@/components/fan-ui/fan-number";
import { Check } from "@/components/fan-ui/fan-icons";

import type { GroupPage } from "@/features/groups/domain/contracts";
import { GroupImage } from "@/features/groups/ui/group-image";
import type { AppLocale } from "@/i18n/locales";
import type { DukjilAttendanceList } from "../domain/dukjil-ui";
import { CreatorAttendanceDialog } from "./creator-attendance-dialog";
import { dukjilText } from "./dukjil-copy";
import { DukjilProvider } from "./dukjil-provider";

import styles from "./attendance-avatars.module.css";

type Creator = GroupPage & { slug: string };
type Item = DukjilAttendanceList["items"][number] | undefined;

/** `연속 {0}일`의 숫자만 크게 보이도록 번역 문구를 숫자 앞뒤로 나눈다(언어마다 숫자 위치가 다르다). */
function StreakFigure({ locale, streak }: { locale: AppLocale; streak: number }) {
  const [before, after] = dukjilText(locale, "dukjilStreak", ["\u0001"]).split("\u0001");
  return <small className={styles.streak}><FanActivityStamp kind="streak" />{before}<FanNumber value={streak} size="lg" locale={locale} />{after}</small>;
}

/** 내 페이지 출석 현황: 아바타, 이름과 상태, 출석 행동을 한 행에 둔다. */
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

        <span className={styles.avatar} role="img" aria-label={page.name} data-attended={attended ? "true" : "false"}>
          {page.imageUrl ? <GroupImage locale={locale} src={page.imageUrl} alt="" width={40} height={40} className={styles.image} /> : <span className={styles.image} aria-hidden="true" />}
        </span>

      <span className={styles.copy}><strong>{page.name}</strong>{item && item.streak > 0 ? <StreakFigure locale={locale} streak={item.streak} /> : null}</span>
      {attended && <FanAction className={styles.action} disabled onClick={() => setOpen(true)}><FanIcon icon={Check} size={16} />{dukjilText(locale, "dukjilBadgeDone")}</FanAction>}
      {!attended && (item && !item.hasPassport
        ? <FanAction className={styles.action} href={reviewHref}>{dukjilText(locale, "dukjilReview")}</FanAction>
        : <FanAction className={styles.action} onClick={() => setOpen(true)}>{dukjilText(locale, "dukjilCheckInShort")}</FanAction>)}
      {open && <DukjilProvider slug={page.slug} locale={locale} hasPassport={item?.hasPassport}><CreatorAttendanceDialog open pageName={page.name} reviewHref={reviewHref} onClose={() => { setOpen(false); onChanged(); }} /></DukjilProvider>}
    </li>
  );
}
