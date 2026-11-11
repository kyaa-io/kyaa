"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { Route } from "next";
import { FanDialog } from "@/components/fan-ui/fan-dialog";
import { FanRewardPop } from "@/components/fan-ui/fan-motion";
import { useAppLocale } from "@/components/locale-provider";
import { useGroupRequest, useGroupResource } from "@/features/groups/ui/use-group-resource";
import { FanTierBadge } from "@/features/rewards/ui/fan-tier-badge";
import { fanTierName } from "@/features/rewards/domain/fan-stage";
import { toContentLocale } from "@/i18n/locales";
import { tierChangesSchema, type TierChange } from "../domain/tier-history";
import { tierHistoryCopy } from "./tier-history-copy";
import styles from "./tier-history.module.css";

const parse = (value: unknown) => tierChangesSchema.parse(value);
const QUIET_PATHS = /^\/(?:admin|operator|login|auth|onboarding|account-deletion)(?:\/|$)/;

/** 261107-2 D11: once a tier rises, one dialog says so (the tier stamp lands with the reward pop) and points to the passport's history.
 * The read also records the change (GET /api/me/tier-changes), and runs again after every write the app makes, so the dialog
 * follows the action that caused it. A rise is marked seen as soon as it is shown, so a reload never shows it twice. */
export function TierCelebration() {
  const { ownerKey } = useGroupRequest();
  return <OwnedTierCelebration key={ownerKey} />;
}

function OwnedTierCelebration() {
  const { locale } = useAppLocale();
  const pathname = usePathname() ?? "/";
  const { request, authenticated } = useGroupRequest();
  const quiet = QUIET_PATHS.test(pathname);
  const changes = useGroupResource(authenticated && !quiet ? `/api/me/tier-changes?locale=${toContentLocale(locale)}` : null, parse);
  // Rises closed on this screen stay closed even if a re-read returns them before the seen mark lands.
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(() => new Set());
  const [held, setHeld] = useState<TierChange[]>([]);
  useEffect(() => {
    if (!authenticated || quiet) { setHeld([]); return; }
    setHeld(current => {
      const known = new Set(current.map(change => change.id));
      const fresh = (changes.data?.changes ?? []).filter(change => !known.has(change.id) && !dismissed.has(change.id));
      return fresh.length ? [...current, ...fresh] : current;
    });
  }, [authenticated, quiet, changes.data, dismissed]);
  const batch = held.filter(change => !dismissed.has(change.id));
  const ids = batch.map(change => change.id).join(",");
  const posted = useRef(new Set<string>());
  useEffect(() => {
    // Marked seen as soon as it is shown, so a reload or another tab never shows the same rise twice.
    const fresh = ids ? ids.split(",").filter(id => !posted.current.has(id)) : [];
    if (!fresh.length) return;
    fresh.forEach(id => posted.current.add(id));
    void request("/api/me/tier-changes/seen", { method: "POST", body: JSON.stringify({ ids: fresh }) }).catch(() => undefined);
  }, [ids, request]);
  // The highest rise of the batch speaks for all of them.
  const shown = batch.at(-1);
  if (!shown) return null;
  // B3: the tier bonuses paid for the rises of the shown passport only (the dialog names one creator's passport; review F4)
  const bonus = batch.filter(change => change.passportId === shown.passportId).reduce((sum, change) => sum + (change.bonusPoints ?? 0), 0);
  return <TierRiseDialog change={shown} bonusPoints={bonus} onClose={() => setDismissed(current => new Set([...current, ...batch.map(change => change.id)]))} />;
}

export function TierRiseDialog({ change, bonusPoints = 0, onClose }: { change: TierChange; bonusPoints?: number; onClose: () => void }) {
  const { locale } = useAppLocale();
  const router = useRouter();
  const c = tierHistoryCopy(locale);
  const [landed, setLanded] = useState(false);
  // FanRewardPop plays when its trigger changes after mount: flip it once the dialog is on screen.
  useEffect(() => { const frame = requestAnimationFrame(() => setLanded(true)); return () => cancelAnimationFrame(frame); }, []);
  const open = useCallback(() => { onClose(); router.push(`/passports/${encodeURIComponent(change.passportId)}?locale=${locale}#tier-history` as Route); }, [change.passportId, locale, onClose, router]);
  const tier = fanTierName(locale, change.tier);
  return <FanDialog open onOpenChange={value => { if (!value) onClose(); }} size="sm" title={c.risen(tier)} closeLabel={c.close}
    primary={{ label: c.history, onClick: open }} secondary={{ label: c.close, onClick: onClose }}>
    <div className={styles.rise} data-tier-rise={change.tier}>
      <FanRewardPop trigger={landed} kind="complete"><FanTierBadge tier={change.tier} locale={locale} size={112} adjacentLabel={false} className={styles.riseBadge} /></FanRewardPop>
      <p className={styles.riseLine}><strong>{c.passport(change.name)}</strong><span>{fanTierName(locale, change.previousTier)} → {tier}</span>{bonusPoints > 0 && <span className={styles.riseBonus}>{c.bonus(bonusPoints.toLocaleString(locale))}</span>}</p>
    </div>
  </FanDialog>;
}
