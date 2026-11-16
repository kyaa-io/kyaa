import { ChevronDown, ChevronRight } from "lucide-react";
import type { Route } from "next";
import Image from "next/image";
import Link from "../../../components/fan-ui/hover-prefetch-link";
import type { ReactNode } from "react";

import type { AppLocale } from "@/i18n/locales";
import type { GuideActivity, GuideModel, GuideSlot } from "../domain/guide-model";
import { rankingsText } from "@/features/rankings/ui/rankings-copy";
import { proofsText, type ProofsCopyKey } from "@/features/passport-proofs/ui/proofs-copy";
import { PROOF_TYPES } from "@/features/passport/domain/proof-types";
import { GuideCta, GuideFansLink, GuideProgress } from "./guide-live";
import { JjinfanChallengeDetail } from "@/features/rankings/ui/jjinfan-detail";
import { GROUP_WALLET_POINT_COST } from "@/server/group-wallet/domain";
import { EarnBadge } from "@/features/dukjil/ui/earn-badge";
import { activityLabel, guideDetailText, guideText, limitText, pointsText } from "./guide-copy";
import styles from "./guide-content.module.css";
import { FanSectionHeader } from "@/components/fan-ui/fan-heading";
import { FanSectionLink } from "@/components/fan-ui/fan-section-link";
import { FanText } from "@/components/fan-ui/fan-text";
import { DukjilProvider } from "@/features/dukjil/ui/dukjil-provider";
import { GuestMissionBook } from "@/features/passport/ui/passport-mission-book";
import { HomeNoticeParticipation } from "@/features/home/ui/home-notice-participation";
import { MissionbookLikeCount } from "@/features/home/ui/missionbook-like-count";
import { MISSIONBOOK_NOTICE_SLUG } from "@/features/home/domain/missionbook-likes";
import { followEventPath } from "@/app/follow/follow-event";

// Hearts per claimed mission book page: the claim result in dukjil-types is `hearts: z.literal(1)`, so this mirrors that contract.
export const HEARTS_PER_PAGE = 1;

function localeHref(path: string, locale: AppLocale): Route {
  return `${path}?locale=${locale}` as Route;
}

function PointsCell({ locale, activity }: { locale: AppLocale; activity: GuideActivity }) {
  const extra = activity.points !== null && activity.firstPoints !== null ? guideText(locale, "dkgPointsFirst", [activity.firstPoints]) : "";
  const streak = activity.streak ? guideText(locale, "dkgStreak", [activity.streak.every, activity.streak.bonus]) : "";
  return (
    <>
      {/* 한 가지 값이면 앱의 포인트 알약 그대로, 범위·첫 인증만 있는 값은 글자로 둔다. */}
      {activity.points !== null && activity.pointsMax === null ? <EarnBadge variant="inline" locale={locale} points={activity.points} slot /> : <strong>{pointsText(locale, activity)}</strong>}
      {extra ? <span className={styles.sub}>{extra}</span> : null}
      {streak ? <span className={styles.sub}>{streak}</span> : null}
    </>
  );
}

const ART = "/images/home-banners/261107";
type StepArt = "passport" | "stamp" | "calendar" | "coin" | "ticket" | "gift";
type HeroArt = { src: string; width: number; height: number };
const JJINFAN_HEAD: HeroArt = { src: `${ART}/jjinfan-head.webp`, width: 1672, height: 941 };
/** 덕질미션북 picture, the same one the home banner uses (new file name per version so cached pages pick it up). */
export const MISSIONBOOK_ART: HeroArt = { src: "/images/guide/missionbook-v2-wide.webp", width: 1536, height: 1024 };

/** Hero: big title, the real condition, the main action and the approved header picture. */
function GuideHero({ id, title, lead, art, actions, children, embedded = false }: { id: string; title: string; lead?: string; art: HeroArt; actions: ReactNode; children?: ReactNode; embedded?: boolean }) {
  const Heading = embedded ? "h2" : "h1";
  return (
    <section className={styles.hero} aria-labelledby={id}>
      <div className={styles.heroCopy}>
        <Heading id={id}>{title}</Heading>
        {lead ? <p className={styles.heroLead}>{lead}</p> : null}
        {children}
        <div className={styles.heroActions}>{actions}</div>
      </div>
      <div className={styles.heroArt}>
        <Image src={art.src} alt="" width={art.width} height={art.height} priority={!embedded} sizes="(max-width: 1023px) calc(100vw - 32px), 560px" />
      </div>
    </section>
  );
}

/** Figures read from the catalog: big number, short label. */
function GuideFacts({ items }: { items: readonly { value: number; label: string }[] }) {
  return (
    <ul className={styles.facts}>
      {items.map((item) => (
        <li key={item.label}><strong>{item.value.toLocaleString("en-US")}</strong><span>{item.label}</span></li>
      ))}
    </ul>
  );
}

/** Numbered section with its own picture. */
function GuideSection({ id, no, art, title, badge, lead, children }: { id: string; no: number; art: StepArt; title: string; badge?: ReactNode; lead?: string; children?: ReactNode }) {
  return (
    <section className={styles.section} aria-labelledby={id}>
      <header className={styles.sectionHead}>
        <div className={styles.sectionTitle}>
          <span className={styles.sectionNo} aria-hidden="true">{String(no).padStart(2, "0")}</span>
          <h2 id={id}>{title}{badge}</h2>
          {lead ? <p className={styles.lead}>{lead}</p> : null}
        </div>
        <Image className={styles.sectionArt} src={`${ART}/step-${art}.webp`} alt="" width={960} height={960} sizes="(max-width: 767px) 88px, 144px" />
      </header>
      {children}
    </section>
  );
}

/** 덕질 하나의 이름, 포인트, 한도. 포인트 표와 각 구역이 같은 행을 쓴다. */
function ActivityRow({ locale, activity }: { locale: AppLocale; activity: GuideActivity }) {
  const limit = limitText(locale, activity);
  return (
    <li data-activity={activity.key}>
      <div className={styles.ruleHead}>
        <span className={styles.ruleName}>{activityLabel(locale, activity.key)}</span>
        {activity.soon ? <SoonBadge locale={locale} /> : null}
      </div>
      <div className={styles.ruleValue}><PointsCell locale={locale} activity={activity} /></div>
      <div className={styles.ruleMeta}>
        {limit ? <span>{limit}</span> : null}
        {activity.stamp ? <span>{guideText(locale, "dkgStamp")}</span> : null}
      </div>
    </li>
  );
}

function ActivityRows({ locale, activities, split = false }: { locale: AppLocale; activities: readonly (GuideActivity | undefined)[]; split?: boolean }) {
  const shown = activities.filter((activity): activity is GuideActivity => Boolean(activity));
  return shown.length ? <ul className={split ? `${styles.rules} ${styles.rulesSplit}` : styles.rules}>{shown.map((activity) => <ActivityRow key={activity.key} locale={locale} activity={activity} />)}</ul> : null;
}

/** Mission book slots as a numbered board. */
function SlotBoard({ locale, model }: { locale: AppLocale; model: NonNullable<GuideModel> }) {
  return (
    <>
      <h3 className={styles.subTitle}>{guideText(locale, "dkgJjBookTitle", [model.slots.length])}</h3>
      <ol className={styles.slots}>
        {model.slots.map((slot) => (
          <li key={slot.slot}>
            <span className={styles.slotNo}>{slot.slot}</span>
            <div className={styles.slotBody}>
              <span className={styles.slotName}>{slotLabel(locale, slot)}</span>
              {slot.activity && slot.action !== "steady_checkin" ? <span className={styles.sub}>{pointsText(locale, slot.activity)}</span> : null}
              {slot.required ? <span className={styles.badge}>{guideText(locale, "dkgRequired")}</span> : null}
              {slot.activity?.soon ? <SoonBadge locale={locale} /> : null}
            </div>
          </li>
        ))}
      </ol>
    </>
  );
}

/** Collapsible questions. The first one starts open so the section never reads as empty. */
function GuideFaq({ id, locale, items }: { id: string; locale: AppLocale; items: readonly { q: string; a: string }[] }) {
  return (
    <section className={styles.section} aria-labelledby={id}>
      <FanSectionHeader id={id} title={guideText(locale, "dkgFaqTitle")} />
      <ul className={styles.faq}>
        {items.map((item, index) => (
          <li key={item.q}>
            <details open={index === 0}>
              <summary><span>{item.q}</span><ChevronDown size={20} aria-hidden="true" /></summary>
              <p>{item.a}</p>
            </details>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Last action of the page. */
function GuideClosing({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className={styles.closing} aria-label={title}>
      <h2>{title}</h2>
      <div className={styles.closingActions}>{children}</div>
    </section>
  );
}

function SoonBadge({ locale }: { locale: AppLocale }) {
  return <span className={styles.badge}>{guideText(locale, "dkgSoon")}</span>;
}

function slotLabel(locale: AppLocale, slot: GuideSlot) {
  if (slot.action === "steady_checkin") return guideText(locale, "dkgActSteady", [slot.days ?? 0]);
  return slot.activity ? activityLabel(locale, slot.activity.key) : "";
}

function Empty({ locale }: { locale: AppLocale }) {
  return <p className={styles.empty}>{guideText(locale, "dkgEmpty")}</p>;
}

type GuideKey = Parameters<typeof guideText>[1];
const PROOF_NAME: Record<string, ProofsCopyKey> = {
  membership: "pfTypeMembership",
  purchase: "pfTypePurchase",
  receipt: "pfTypeReceipt",
  ticket: "pfTypeTicket",
  donation: "pfTypeDonation",
  funding: "pfTypeFunding",
  kyaa_payment: "pfTypeKyaaPayment",
};
const PROOF_LISTS: Record<string, { show: GuideKey; hide: GuideKey }> = {
  membership: { show: "dkgPfMembershipShow", hide: "dkgPfMembershipHide" },
  purchase: { show: "dkgPfPurchaseShow", hide: "dkgPfPurchaseHide" },
  receipt: { show: "dkgPfReceiptShow", hide: "dkgPfReceiptHide" },
  ticket: { show: "dkgPfTicketShow", hide: "dkgPfTicketHide" },
  donation: { show: "dkgPfDonationShow", hide: "dkgPfDonationHide" },
  funding: { show: "dkgPfFundingShow", hide: "dkgPfFundingHide" },
};

function ProofKinds({ locale, open }: { locale: AppLocale; open: boolean }) {
  if (!open) return <p className={styles.empty}>{guideText(locale, "dkgPfSoon")}</p>;
  return (
    <ul className={styles.kinds}>
      {PROOF_TYPES.map((type) => {
        const lists = PROOF_LISTS[type];
        return (
          <li key={type} data-proof-kind={type}>
            <span className={styles.ruleName}>{proofsText(locale, PROOF_NAME[type])}</span>
            {lists ? (
              <dl>
                <dt>{guideText(locale, "dkgPfShow")}</dt>
                <dd>{guideText(locale, lists.show)}</dd>
                <dt>{guideText(locale, "dkgPfHide")}</dt>
                <dd>{guideText(locale, lists.hide)}</dd>
              </dl>
            ) : (
              <>
                <p className={styles.sub}>{guideText(locale, "dkgPfAuto")}</p>
                <SoonBadge locale={locale} />
              </>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function ExampleCard({ locale, good }: { locale: AppLocale; good: boolean }) {
  return (
    <li data-example={good ? "good" : "bad"}>
      <span className={styles.badge}>{guideText(locale, "dkgExTag")}</span>
      <div className={styles.mock} aria-hidden="true">
        <span className={styles.mockLine}>{guideText(locale, "dkgExLinePaid")}</span>
        <span className={styles.mockLine}>{guideText(locale, "dkgExLineItem")}</span>
        <span className={styles.mockLine}>
          {guideText(locale, "dkgExLinePhone")}{" "}
          {good ? <span className={styles.mockBar} /> : <span className={styles.mockNumber}>010-0000-0000</span>}
        </span>
      </div>
      <strong className={styles.ruleName}>{guideText(locale, good ? "dkgExGood" : "dkgExBad")}</strong>
    </li>
  );
}

const jjinfanFaq = (locale: AppLocale, subscription: boolean) => [
  ...(subscription ? [{ q: guideText(locale, "dkgFaqSubQ"), a: guideText(locale, "dkgFaqSubA") }] : []),
  { q: guideText(locale, "dkgFaqAmountQ"), a: guideText(locale, "dkgFaqAmountA") },
  { q: guideText(locale, "dkgFaqResultQ"), a: guideText(locale, "dkgFaqResultA") },
  { q: guideText(locale, "dkgFaqPrivacyQ"), a: guideText(locale, "dkgFaqPrivacyA") },
];

export function JjinfanGuideContent({ locale, model, challenge = false }: { locale: AppLocale; model: GuideModel; challenge?: boolean }) {
  const open = model?.slots.filter((slot) => !slot.required).length ?? 0;
  const required = model?.slots.filter((slot) => slot.required).length ?? 0;
  const proof = model?.activities.find((activity) => activity.key === "proof");
  const quiz = model?.activities.find((activity) => activity.key === "quiz");
  const subscription = model?.activities.some((activity) => activity.key === "subscription") ?? false;
  return (
    <>
      <GuideHero
        id="jjinfan-guide-title"
        art={JJINFAN_HEAD}
        title={guideText(locale, "dkgJjTitle")}
        lead={model ? guideDetailText(locale, "dkgJjLead", [model.slots.length]) : undefined}
        actions={<><GuideCta locale={locale} target="mission-book" returnPath="/guide/jjinfan" /><Link className={styles.secondary} href={localeHref("/guide/dukjil", locale)}>{guideText(locale, "dkgLinkDukjil")}</Link></>}
      >
        <GuideProgress locale={locale} />
      </GuideHero>

      {challenge ? <JjinfanChallengeDetail locale={locale} /> : null}

      {model ? <GuideFacts items={[
        { value: model.slots.length, label: guideDetailText(locale, "dkgFactSlots") },
        { value: open, label: guideDetailText(locale, "dkgFactOpen") },
        ...(required > 0 ? [{ value: required, label: guideDetailText(locale, "dkgFactRequired") }] : []),
      ]} /> : null}

      <GuideSection id="jjinfan-steps" no={1} art="passport" title={guideText(locale, "dkgJjStep1Title")} lead={guideText(locale, "dkgJjStep1Desc")}>
        <ActivityRows locale={locale} activities={[quiz]} />
      </GuideSection>

      <GuideSection id="jjinfan-book" no={2} art="calendar" title={guideText(locale, "dkgJjStep2Title")} lead={model ? guideText(locale, "dkgJjStep2Desc", [open]) : undefined}>
        {model ? <SlotBoard locale={locale} model={model} /> : <Empty locale={locale} />}
      </GuideSection>

      <GuideSection id="jjinfan-stamp" no={3} art="stamp" title={guideText(locale, "dkgJjStep3Title")} badge={model && !model.proofOpen ? <SoonBadge locale={locale} /> : null} lead={guideText(locale, "dkgJjStep3Desc")}>
        <ActivityRows locale={locale} activities={[proof]} />
      </GuideSection>

      {model ? (
        <GuideSection id="jjinfan-proof" no={4} art="ticket" title={guideText(locale, "dkgPfTitle")} badge={model.proofOpen ? null : <SoonBadge locale={locale} />}>
          <ProofKinds locale={locale} open={model.proofOpen} />
          {model.proofOpen ? (
            <>
              <h3 id="jjinfan-example" className={styles.subTitle}>{guideText(locale, "dkgExTitle")}</h3>
              <ul className={styles.examples}>
                <ExampleCard locale={locale} good />
                <ExampleCard locale={locale} good={false} />
              </ul>
            </>
          ) : null}
        </GuideSection>
      ) : null}

      {model && model.proofOpen ? (
        <GuideSection id="jjinfan-benefit" no={5} art="gift" title={guideText(locale, "dkgBnTitle")}>
          <ul className={styles.benefits}>
            {proof && proof.points !== null ? (
              <li>
                <span className={styles.ruleName}>{activityLabel(locale, "proof")}</span>
                <div className={styles.ruleValue}><PointsCell locale={locale} activity={proof} /></div>
              </li>
            ) : null}
            <li>
              <span className={styles.ruleName}>{proofsText(locale, "pfBoard")}</span>
              <span className={styles.benefitText}>{guideText(locale, "dkgBnBoard")}</span>
            </li>
            <li>
              <span className={styles.ruleName}>{proofsText(locale, "pfFanTitle", ["n"])}</span>
              <span className={styles.benefitText}>{guideText(locale, "dkgBnBadge", [proofsText(locale, "pfFanTitle", ["n"])])}</span>
            </li>
          </ul>
        </GuideSection>
      ) : null}

      {model && model.proofOpen ? <GuideFaq id="jjinfan-faq" locale={locale} items={jjinfanFaq(locale, subscription)} /> : null}

      <GuideClosing title={model ? guideDetailText(locale, "dkgJjCloseTitle", [model.slots.length]) : guideText(locale, "dkgJjMetaTitle")}>
        <GuideCta locale={locale} target="mission-book" returnPath="/guide/jjinfan" />
        <GuideFansLink locale={locale} />
        <Link className={styles.secondary} href={localeHref("/rankings", locale)}>{rankingsText(locale, "rkTitle")}</Link>
      </GuideClosing>
    </>
  );
}

/** 덕질미션북 (/follow 이벤트 화면 아래, `embedded`): what the book is, the real page of slots, what a full page and the points become, then every activity's points.
 * The like count in the hero is the X Opening event like count (the like button is the event card above); share and comments at the very bottom belong to one 안내 게시판 notice (user 11/16). */
export function DukjilGuideContent({ locale, model }: { locale: AppLocale; model: GuideModel }) {
  const embedded = true;
  const proofSlot = model?.slots.find((slot) => slot.required);
  const title = guideDetailText(locale, "dkgMbTitle");
  return (
    <>
      <GuideHero
        id="dukjil-guide-title"
        embedded={embedded}
        art={MISSIONBOOK_ART}
        title={title}
        lead={model ? guideDetailText(locale, "dkgMbLead", [model.slots.length, HEARTS_PER_PAGE]) : undefined}
        actions={<><GuideCta locale={locale} target="mission-book" returnPath={followEventPath} /><Link className={styles.secondary} href={localeHref("/guide/jjinfan", locale)}>{guideText(locale, "dkgLinkJjinfan")}</Link></>}
      >
        <MissionbookLikeCount locale={locale} />
        <GuideProgress locale={locale} />
      </GuideHero>

      {model ? (
        <section className={styles.bookSection} aria-labelledby="dukjil-book">
          <div className={styles.stack}>
            <FanSectionHeader id="dukjil-book" title={guideDetailText(locale, "dkgMbBookTitle", [model.slots.length])} description={proofSlot ? guideDetailText(locale, "dkgMbBookLead", [proofSlot.slot]) : undefined} />
            <DukjilProvider locale={locale}><GuestMissionBook locale={locale} guide headingLevel={3} /></DukjilProvider>
          </div>
          <div className={styles.stack}>
            <FanSectionHeader id="dukjil-reward" title={guideDetailText(locale, "dkgMbRewardTitle")} />
            <ul className={styles.rewards} aria-labelledby="dukjil-reward">
              <li id="dukjil-heart" data-row="guide-reward">
                <img src="/images/dukjil-duo/glyph-heart-160.webp" alt="" width={56} height={56} />
                <div>
                  <FanText role="item" as="strong">{guideDetailText(locale, "dkgMbHeart", [HEARTS_PER_PAGE])}</FanText>
                  <FanText role="body" as="p">{guideDetailText(locale, "dkgMbHeartDesc", [model.slots.length])}</FanText>
                  <FanSectionLink href={localeHref("/rankings", locale)}>{rankingsText(locale, "rkTitle")}</FanSectionLink>
                </div>
              </li>
              <li id="dukjil-exchange" data-row="guide-reward">
                <img src="/images/dukjil-duo/glyph-ticket-160.webp" alt="" width={56} height={56} />
                <div>
                  <FanText role="item" as="strong">{guideDetailText(locale, "dkgMbTicket")}</FanText>
                  <FanText role="body" as="p">{guideDetailText(locale, "dkgXchLead", [GROUP_WALLET_POINT_COST])}</FanText>
                </div>
              </li>
            </ul>
          </div>
        </section>
      ) : null}

      <section className={styles.stack} aria-labelledby="dukjil-table">
        <FanSectionHeader id="dukjil-table" title={guideText(locale, "dkgDkTableTitle")} />
        {model && model.activities.length > 0 ? <ActivityRows locale={locale} activities={model.activities} split /> : <Empty locale={locale} />}
      </section>

      {model ? (
        <GuideFaq id="dukjil-faq" locale={locale} items={[
          { q: guideDetailText(locale, "dkgFaqDkLimitQ"), a: guideDetailText(locale, "dkgFaqDkLimitA") },
          { q: guideDetailText(locale, "dkgFaqDkWhereQ"), a: guideDetailText(locale, "dkgFaqDkWhereA") },
        ]} />
      ) : null}

      <GuideClosing title={model ? guideDetailText(locale, "dkgDkCloseTitle", [model.activities.length]) : guideText(locale, "dkgDkMetaTitle")}>
        <GuideCta locale={locale} target="mission-book" returnPath={followEventPath} />
        <GuideFansLink locale={locale} />
      </GuideClosing>

      <div id="dukjil-likes" className={styles.participation}>
        <HomeNoticeParticipation slug={MISSIONBOOK_NOTICE_SLUG} title={title} locale={locale} returnPath={followEventPath} reactions={false} />
      </div>
    </>
  );
}
