"use client";
import { useEffect, useId, useRef, useState } from "react";
import { Check, Gift, Stamp, X } from "lucide-react";
import { Dialog } from "@/components/ui/overlay/accessible-overlay";
import { FanAction } from "@/components/fan-ui/fan-action";
import { FanHeading } from "@/components/fan-ui/fan-heading";
import { GroupRequestError, useGroupRequest } from "@/features/groups/ui/use-group-resource";
import { attendanceFirstStampLabel } from "@/features/group-wallet/ui/attendance-copy";
import { walletCopy } from "@/features/group-wallet/ui/copy";
import walletStyles from "@/features/group-wallet/ui/wallet.module.css";
import { messages as closeMessages } from "@/i18n/catalogs/features__benefit__ui__benefit-screen";
import { translate } from "@/i18n/messages";
import { EarnBadge } from "./earn-badge";
import { checkinDayPoints, checkinNumbers, isBonusDay, parseAttendanceResult, streakCells } from "../domain/dukjil-ui";
import type { AppLocale } from "@/i18n/locales";
import { dukjilText } from "./dukjil-copy";
import { useDukjil } from "./dukjil-provider";
import { preloadStampPress, StampPress } from "./stamp-press";
import { celebrateStamp } from "./stamp-slam";
import styles from "./dukjil.module.css";
import missionStyles from "./fan-missions.module.css";
import inkStyles from "@/components/fan-ui/fan-ink.module.css";
import { sendGa4Event } from "@/features/analytics/client/ga4-client";

const STAMP_ART = "/images/stamps/ink-v1/daily-checkin.webp";
type Failure = "none" | "failed" | "cap" | "inactive" | "passport";

/** Per-creator attendance (plan §4.3). Numbers come from the catalog row `checkin`; the server result decides what is shown as done. */
/** The title names the page the dialog was opened for; without a name it is generic, never another creator's. */
const dialogTitle = (locale: AppLocale, pageName: string | undefined) =>
  pageName ? dukjilText(locale, "dukjilPageTitle", [pageName]) : locale === "ko" ? walletCopy(locale).attendance : dukjilText(locale, "dukjilTitle");

export function CreatorAttendanceDialog({ open, onClose, reviewHref, pageName }: { open: boolean; onClose: () => void; reviewHref: string; pageName?: string }) {
  const state = useDukjil();
  const auth = useGroupRequest();
  const titleId = useId();
  const requestKey = useRef<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<Failure>("none");
  const [pressed, setPressed] = useState(false);
  useEffect(() => { if (open) preloadStampPress(); }, [open]);
  if (!state || state.status !== "on" || !state.slug) return null;
  const { locale, catalog, attendance, hasPassport } = state;
  const slug = state.slug ?? "";
  const numbers = checkinNumbers(catalog);
  const { points, bonus } = numbers;
  const checkedIn = attendance?.attendedToday ?? false;
  const streak = attendance?.streak ?? 0;
  const cells = streakCells(streak, checkedIn, attendance?.nextBonusIn ?? null);
  const noPassport = hasPassport === false || failure === "passport";
  const returnTo = `/${slug}?locale=${locale}`;
  const close = locale === "ko" ? "닫기" : translate(locale, closeMessages.m05a1db569ca0, "Close");

  async function claim() {
    setBusy(true);
    setFailure("none");
    requestKey.current ??= crypto.randomUUID();
    try {
      const result = parseAttendanceResult(await auth.request(`/api/me/attendance/${encodeURIComponent(slug)}`, { method: "POST", body: JSON.stringify({ requestKey: requestKey.current }) }, "json", false));
      requestKey.current = null;
      if (!result.replayed) sendGa4Event("daily_checkin");
      setPressed(true);
      // D3: a stamp the server just issued lands over the whole screen (not on a replay); the dialog then shows it still.
      if (result.stampId && !result.replayed) void celebrateStamp({ locale, points: result.points + result.bonusPoints, stamps: 1 });
      state!.setAttendance({ attendedToday: true, streak: result.streak, nextBonusIn: null, result });
      state!.refresh();
    } catch (error) {
      if (error instanceof GroupRequestError) {
        if (error.code === "PASSPORT_REQUIRED") setFailure("passport");
        else if (error.code === "DUKJIL_DAILY_LIMIT") setFailure("cap");
        else if (error.code === "POLICY_INACTIVE") setFailure("inactive");
        else setFailure("failed");
      } else setFailure("failed");
    } finally {
      setBusy(false);
    }
  }

  const heading = streak === 0 && !checkedIn ? attendanceFirstStampLabel(locale) : dukjilText(locale, "dukjilStreak", [streak]);
  const notice = failure === "cap" ? "dukjilCapReached" : failure === "inactive" ? "dukjilInactive" : failure === "failed" ? "dukjilFailed" : state.todayFailure ? "dukjilLoadError" : null;
  const earned = attendance?.result;
  const pending = !state.attendanceKnown && !state.todayFailure;

  return (
    <Dialog open={open} onClose={onClose} labelledBy={titleId} backdropClassName={walletStyles.supportBackdrop} contentClassName={`${walletStyles.supportDialog} ${walletStyles.attendanceDialog}`}>
      <header className={walletStyles.supportDialogHeader}><h2 id={titleId}>{dialogTitle(locale, pageName)}</h2><FanAction variant="text" ariaLabel={close} leadingIcon={<X />} onClick={onClose} /></header>
      {!state.authenticated ? (
        <FanAction variant="primary" href={`/login?locale=${locale}&returnTo=${encodeURIComponent(returnTo)}`}>{walletCopy(locale).login}</FanAction>
      ) : (
        <section className={`${styles.checkin} ${inkStyles.palette}`}>
          <div className={styles.checkinBox}>
            <div className={styles.checkinHead}>
              {pressed || checkedIn ? <StampPress state="stamped" size={48} /> : <img className={styles.checkinArt} src={STAMP_ART} alt="" width={48} height={48} />}
              <div className={styles.checkinHeadCopy}>
                <FanHeading as="h3">{heading}</FanHeading>
                <span className={styles.checkinBar}>
                  <span className={missionStyles.bar} role="progressbar" aria-label={heading} aria-valuemin={0} aria-valuemax={7} aria-valuenow={cells.filled}><i style={{ width: `${Math.round((cells.filled / 7) * 100)}%` }} /></span>
                  <span className={missionStyles.count}>{cells.filled.toLocaleString(locale)}/{(7).toLocaleString(locale)}</span>
                </span>
              </div>
            </div>
            <ol className={styles.track}>
              {Array.from({ length: 7 }, (_, index) => {
                const day = index + 1, completed = index < cells.filled, today = index === cells.todayIndex;
                return (
                  <li key={index} className={styles.trackDay} data-state={completed ? "past" : today ? "today" : "next"} aria-current={today ? "date" : undefined}>
                    {completed ? <><img src={STAMP_ART} alt="" width={40} height={40} /><span className={styles.srOnly}>{dukjilText(locale, "dukjilDayDone", [day])}</span></>
                      : isBonusDay(numbers, day) ? <><Gift size={20} aria-hidden="true" /><span className={styles.srOnly}>{day.toLocaleString(locale)}</span></> : day.toLocaleString(locale)}
                  </li>
                );
              })}
            </ol>
            {points !== undefined && (
              <dl className={styles.checkinRewards}>
                <div><dt>{dukjilText(locale, "checkinRewardDaily")}</dt><dd><EarnBadge variant="inline" locale={locale} points={points} /></dd></div>
                {numbers.every !== undefined && Boolean(bonus) && <div><dt>{dukjilText(locale, "checkinRewardBonus", [numbers.every])}</dt><dd><EarnBadge variant="inline" locale={locale} points={checkinDayPoints(numbers, numbers.every)} /></dd></div>}
              </dl>
            )}
          </div>
          {notice && <div className={styles.state} role="alert"><span>{dukjilText(locale, notice)}</span>{(notice === "dukjilFailed" || notice === "dukjilLoadError") && <FanAction onClick={notice === "dukjilFailed" ? () => void claim() : state.refresh}>{notice === "dukjilFailed" ? dukjilText(locale, "dukjilCheckInShort") : walletCopy(locale).retry}</FanAction>}</div>}
          {checkedIn ? (
            <p className={styles.checkinDone} role="status">
              <Check size={20} aria-hidden="true" />
              <span>{dukjilText(locale, "dukjilDone")}</span>
              {earned && <EarnBadge variant="inline" locale={locale} points={earned.points + earned.bonusPoints} />}
            </p>
          ) : noPassport ? (
            <FanAction className={styles.checkinAction} variant="primary" href={reviewHref}>{dukjilText(locale, "dukjilStart")}</FanAction>
          ) : (
            <FanAction className={styles.checkinAction} variant="primary" trailingIcon={<Stamp />} loading={busy || pending} disabled={busy || pending || failure === "cap" || failure === "inactive"} onClick={() => void claim()}>
              {points === undefined ? dukjilText(locale, "dukjilCheckInShort") : dukjilText(locale, "dukjilClaim", [(points + (cells.bonusToday ? bonus ?? 0 : 0)).toLocaleString(locale)])}
            </FanAction>
          )}
        </section>
      )}
    </Dialog>
  );
}
