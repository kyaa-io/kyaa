import type { AppLocale } from "../../i18n/locales";
import { PassportStampCanvas, StampArtwork, VerificationSealArtwork, type PassportStampRecord } from "../../features/passport/ui/passport-stamp-artwork";
import { displayStampLabel } from "../../features/passport/domain/first-like-stamp";
import { COMMUNITY_STAMPS, type CommunityStampKind } from "../../features/community-stamps/domain/community-stamps";
import { CommunityStampArtwork } from "../../features/community-stamps/ui/community-stamp-artwork";
import { FanTierBadge } from "../../features/rewards/ui/fan-tier-badge";
import { fanStageLabel } from "../../features/rewards/domain/fan-stage";

const types = ["first_reaction", "knowledge", "reservation", "attendance", "survey", "membership"] as const;
const records: PassportStampRecord[] = ([...types, "knowledge", "attendance", "survey"] as const).map((type, i) => ({
  id: `stamp-${i}`, type, issuedAt: "2026-10-18T08:00:00Z",
}));
const tiers = [
  ["Bronze", "bronze-1"], ["Silver", "silver-1"], ["Silver", "silver-2"],
  ["Gold", "gold-1"], ["Gold", "gold-2"], ["Gold", "gold-3"],
  ["Platinum", "platinum-1"], ["Platinum", "platinum-2"], ["Platinum", "platinum-3"], ["Platinum", "platinum-4"],
  ["Diamond", "diamond-1"],
] as const;

// Real product artwork and CSS with fixed, non-member data.
export function StampArtworkPreview({ locale }: { locale: AppLocale }) {
  return <main style={{ maxWidth: 1100, margin: "32px auto", padding: "0 20px", fontFamily: '"Pretendard Variable", Pretendard, system-ui, sans-serif' }}>
    <h1>Fan Passport</h1>
    <div style={{ maxWidth: 700, margin: "24px auto 40px" }}>
      <PassportStampCanvas celebrityName="NCHIVE" stamps={records} totalCount={9} locale={locale} />
    </div>
    <section aria-label="Stamps" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(145px, 1fr))", gap: 16 }}>
      {types.map(type => <div key={type} style={{ textAlign: "center", minWidth: 0 }}>
        <StampArtwork type={type} locale={locale} />
        <p>{displayStampLabel(locale, type)}</p>
      </div>)}
      {(Object.keys(COMMUNITY_STAMPS) as CommunityStampKind[]).map(kind => <div key={kind} style={{ textAlign: "center", minWidth: 0 }}>
        <CommunityStampArtwork kind={kind} locale={locale} size={145} />
        <p>{COMMUNITY_STAMPS[kind][locale]}</p>
      </div>)}
    </section>
    <section aria-label="Fan tiers" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(145px, 1fr))", gap: 16, marginTop: 40 }}>
      {tiers.map(([tier, key]) => <div key={key} style={{ textAlign: "center", minWidth: 0 }}>
        <FanTierBadge tier={tier} stageKey={key} locale={locale} size={96} />
        <p>{fanStageLabel(locale, { tier, subdivision: Number(key.split("-").at(-1)) })}</p>
      </div>)}
    </section>
    <section aria-label="Verification" style={{ maxWidth: 280, margin: "40px auto" }}>
      <VerificationSealArtwork celebrityName="NCHIVE" issuedAt="2026-10-18T08:00:00Z" points={1} locale={locale} />
    </section>
  </main>;
}
