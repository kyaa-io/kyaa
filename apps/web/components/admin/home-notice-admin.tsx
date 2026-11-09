"use client";
import { useSearchParams } from "next/navigation";
import { homeNoticeCategories, homeNoticeCategoryLabels, homeNoticeErrorMessages } from "@/features/home/domain/home-notice";
import { AdminAccessState } from "./admin-access-state";
import { NoticeManager } from "./notice-manager";
import { AdminOperationsShell, type AdminLocale } from "./operations-shell";
import { useAdminSession } from "./use-admin-session";

/** kyaa's own notices on the home, /notices and /notices/[slug]. Reuses the creator NoticeManager with categories. */
export function AuthorizedHomeNoticeManager() {
  const locale: AdminLocale = useSearchParams().get("lang") === "en" ? "en" : "ko";
  const session = useAdminSession();
  if (session.status !== "authorized") return <AdminAccessState locale={locale} status={session.status} />;
  return <AdminOperationsShell locale={locale} adminRole={session.admin.role}>
    <NoticeManager key={session.admin.email} celebrityId="home" celebrityName="kyaa" role={session.admin.role} locale={locale}
      endpoint="/api/admin/home-notices" categories={homeNoticeCategories} categoryLabels={homeNoticeCategoryLabels[locale]} errorMessages={homeNoticeErrorMessages[locale]} linkable />
  </AdminOperationsShell>;
}
