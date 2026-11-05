"use client";
import { useId, useRef, useState } from "react";
import { CalendarCheck, Check, Gift, Stamp } from "lucide-react";
import { Dialog } from "@/components/ui/overlay/accessible-overlay";
import { FanAction } from "@/components/fan-ui/fan-action";
import { GroupImage } from "@/features/groups/ui/group-image";
import { GroupRequestError, useGroupRequest } from "@/features/groups/ui/use-group-resource";
import { attendanceCopy, attendanceFirstStampLabel } from "@/features/group-wallet/ui/attendance-copy";
import { walletCopy } from "@/features/group-wallet/ui/copy";
import walletStyles from "@/features/group-wallet/ui/wallet.module.css";
import { messages as closeMessages } from "@/i18n/catalogs/features__benefit__ui__benefit-screen";
import { translate } from "@/i18n/messages";
import { checkinNumbers, parseAttendanceResult, streakCells } from "../domain/dukjil-ui";
import { dukjilText } from "./dukjil-copy";
import { useDukjil } from "./dukjil-provider";
import styles from "./dukjil.module.css";

type Failure = "none" | "failed" | "cap" | "inactive" | "passport";

/** Per-creator attendance (plan §4.3). Numbers come from the catalog row `checkin`; the server result decides what is shown as done. */
export function CreatorAttendanceDialog({ open, onClose, reviewHref }: { open: boolean; onClose: () => void; reviewHref: string }) {
  const state = useDukjil();
  const auth = useGroupRequest();
  const titleId = useId();
  const requestKey = useRef<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<Failure>("none");
  if (!state || state.status !== "on" || !state.slug) return null;
  const { locale, catalog, attendance, hasPassport } = state;
  const slug = state.slug ?? "";
  const a = attendanceCopy(locale);
  const { points, bonus } = checkinNumbers(catalog);
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

  return (
    <Dialog open={open} onClose={onClose} labelledBy={titleId} backdropClassName={walletStyles.supportBackdrop} contentClassName={`${walletStyles.supportDialog} ${walletStyles.attendanceDialog}`}>
      <header className={walletStyles.supportDialogHeader}><h2 id={titleId}>{dukjilText(locale, "dukjilTitle")}</h2><FanAction onClick={onClose}>{close}</FanAction></header>
      {!state.authenticated ? (
        <FanAction variant="primary" href={`/login?locale=${locale}&returnTo=${encodeURIComponent(returnTo)}`}>{walletCopy(locale).login}</FanAction>
      ) : (
        <section className={walletStyles.attendance}>
          <div className={walletStyles.streakHeader}><h3 className={walletStyles.streakHeading}>{heading}</h3></div>
          <ol className={walletStyles.streak}>
            {Array.from({ length: 7 }, (_, index) => {
              const completed = index < cells.filled;
              return (
                <li key={index} data-complete={completed} data-bonus={index === 6} data-today={index === cells.todayIndex ? "true" : undefined}>
                  <span>{index + 1}{locale === "ko" ? "일" : ""}</span>
                  {completed ? <GroupImage src="/images/community-stamps/daily-checkin.png" alt={a.stamps} locale={locale} width={64} height={64} /> : index === 6 ? <Gift aria-hidden="true" /> : <CalendarCheck aria-hidden="true" />}
                  {index === 6 && bonus !== undefined && <strong>+{bonus.toLocaleString(locale)}P</strong>}
                </li>
              );
            })}
          </ol>
          {notice && <div className={styles.state} role="alert"><span>{dukjilText(locale, notice)}</span>{(notice === "dukjilFailed" || notice === "dukjilLoadError") && <FanAction onClick={notice === "dukjilFailed" ? () => void claim() : state.refresh}>{dukjilText(locale, "dukjilCheckInShort")}</FanAction>}</div>}
          {checkedIn ? (
            <p className={walletStyles.attendanceDone} role="status">
              <Check size={20} aria-hidden="true" />
              <span>{dukjilText(locale, "dukjilDone")}</span>
              {earned && <strong>+{(earned.points + earned.bonusPoints).toLocaleString(locale)}P</strong>}
            </p>
          ) : noPassport ? (
            <FanAction className={walletStyles.primary} variant="primary" href={reviewHref}>{dukjilText(locale, "dukjilStart")}</FanAction>
          ) : (
            <FanAction className={walletStyles.primary} variant="primary" trailingIcon={<Stamp />} loading={busy} disabled={busy || failure === "cap" || failure === "inactive"} onClick={() => void claim()}>
              {points === undefined ? dukjilText(locale, "dukjilCheckInShort") : dukjilText(locale, "dukjilClaim", [(points + (cells.bonusToday ? bonus ?? 0 : 0)).toLocaleString(locale)])}
            </FanAction>
          )}
        </section>
      )}
    </Dialog>
  );
}
