"use client";
import type { ReactNode } from "react";
import cornerStyles from "@/components/fan-ui/earn-corner.module.css";
import type { AppLocale } from "@/i18n/locales";
import { checkinNumbers } from "../domain/dukjil-ui";
import { useDukjil } from "./dukjil-provider";
import { EarnBadge } from "./earn-badge";

/** The point badge on a check-in button. Check-in's value comes from `checkinNumbers`, so it is not an `EarnBadgeCorner` action. Nothing is drawn once checked in, under an inactive policy, or before a signed-in viewer's state is known. */
export function CheckinCorner({ locale, children }: { locale: AppLocale; children: ReactNode }) {
  const state = useDukjil();
  const { points } = checkinNumbers(state?.catalog);
  const show = state?.status === "on" && points !== undefined && (!state.authenticated || (state.attendanceKnown && !state.attendance?.attendedToday));
  return <span className={cornerStyles.host}>{children}{show && <EarnBadge variant="corner" locale={locale} points={points} />}</span>;
}
