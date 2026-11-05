"use client";
import { WalletAttendanceDialog } from "@/features/group-wallet/ui/wallet-screen";
import type { AppLocale } from "@/i18n/locales";
import { CreatorAttendanceDialog } from "./creator-attendance-dialog";
import { DukjilProvider, DukjilSwitch } from "./dukjil-provider";

/** Entry for screens that know the creator: an active policy opens that creator's attendance directly; otherwise the legacy wallet dialog opens unchanged. */
export function CreatorAttendanceEntry({ slug, locale, reviewHref, onClose }: { slug: string; locale: AppLocale; reviewHref: string; onClose: () => void }) {
  return (
    <DukjilProvider slug={slug} locale={locale}>
      <DukjilSwitch on={<CreatorAttendanceDialog reviewHref={reviewHref} open onClose={onClose} />} off={<WalletAttendanceDialog locale={locale} open onClose={onClose} />} />
    </DukjilProvider>
  );
}
