"use client";
import { useId, useRef, useState } from "react";
import { Check, Gift, Stamp, X } from "lucide-react";
import { Dialog } from "@/components/ui/overlay/accessible-overlay";
import { FanAction } from "@/components/fan-ui/fan-action";
import { GroupRequestError, useGroupRequest } from "@/features/groups/ui/use-group-resource";
import { attendanceFirstStampLabel } from "@/features/group-wallet/ui/attendance-copy";
import { walletCopy } from "@/features/group-wallet/ui/copy";
import walletStyles from "@/features/group-wallet/ui/wallet.module.css";
import { messages as closeMessages } from "@/i18n/catalogs/features__benefit__ui__benefit-screen";
import { translate } from "@/i18n/messages";
import { checkinDayPoints, checkinNumbers, isBonusDay, parseAttendanceResult, streakCells } from "../domain/dukjil-ui";
import type { AppLocale } from "@/i18n/locales";
import { dukjilText } from "./dukjil-copy";
import { useDukjil } from "./dukjil-provider";
import { StampPress } from "./stamp-press";
import styles from "./dukjil.module.css";

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
      setPressed(true);
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
        <section className={styles.checkin}>
          <div className={styles.checkinStage}>
            <StampPress state={pressed ? "press" : checkedIn ? "stamped" : "idle"} />
            <h3>{heading}</h3>
          </div>
          <ol className={styles.days}>
            {Array.from({ length: 7 }, (_, index) => {
              const day = index + 1, completed = index < cells.filled, today = index === cells.todayIndex, value = checkinDayPoints(numbers, day), wide = index === 6;
              const mark = completed ? <><Check size={24} aria-hidden="true" /><span className={styles.srOnly}>{dukjilText(locale, "dukjilDayDone", [day])}</span></> : day.toLocaleString(locale);
              return (
                <li key={index} className={styles.day} data-state={completed ? "past" : today ? "today" : "next"} data-wide={wide} aria-current={today ? "date" : undefined}>
                  {wide ? <span className={styles.dayGift}><span className={styles.dayMark}>{mark}</span>{isBonusDay(numbers, day) && <Gift size={24} aria-hidden="true" />}</span> : <span className={styles.dayMark}>{mark}</span>}
                  {value !== undefined && <span className={styles.dayValue}><img src="/images/economy/point-coin.svg" width={wide ? 20 : 14} height={wide ? 20 : 14} alt="" />+{value.toLocaleString(locale)}{wide ? "P" : ""}</span>}
                </li>
              );
            })}
          </ol>
          {notice && <div className={styles.state} role="alert"><span>{dukjilText(locale, notice)}</span>{(notice === "dukjilFailed" || notice === "dukjilLoadError") && <FanAction onClick={notice === "dukjilFailed" ? () => void claim() : state.refresh}>{notice === "dukjilFailed" ? dukjilText(locale, "dukjilCheckInShort") : walletCopy(locale).retry}</FanAction>}</div>}
          {checkedIn ? (
            <p className={styles.checkinDone} role="status">
              <Check size={20} aria-hidden="true" />
              <span>{dukjilText(locale, "dukjilDone")}</span>
              {earned && <strong>+{(earned.points + earned.bonusPoints).toLocaleString(locale)}P</strong>}
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
