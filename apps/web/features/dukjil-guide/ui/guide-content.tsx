import type { Route } from "next";
import Link from "next/link";

import type { AppLocale } from "@/i18n/locales";
import type { GuideActivity, GuideModel, GuideSlot } from "../domain/guide-model";
import { JJINFAN_CHALLENGE_TARGET } from "@/features/rankings/domain/types";
import { rankingsText } from "@/features/rankings/ui/rankings-copy";
import { proofsText, type ProofsCopyKey } from "@/features/passport-proofs/ui/proofs-copy";
import { PROOF_TYPES } from "@/features/passport/domain/proof-types";
import { GuideCta, GuideFansLink, GuideProgress } from "./guide-live";
import { activityLabel, guideText, limitText, pointsText } from "./guide-copy";
import styles from "./guide-content.module.css";

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
      <strong>{pointsText(locale, activity)}</strong>
      {extra ? <span className={styles.sub}>{extra}</span> : null}
      {streak ? <span className={styles.sub}>{streak}</span> : null}
    </>
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
  return (
    <section className={styles.section} aria-labelledby="jjinfan-proof">
      <h2 id="jjinfan-proof" className={styles.titleRow}>{guideText(locale, "dkgPfTitle")}{open ? null : <SoonBadge locale={locale} />}</h2>
      {open ? (
        <>
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
        </>
      ) : (
        <p className={styles.empty}>{guideText(locale, "dkgPfSoon")}</p>
      )}
    </section>
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

function ProofExtras({ locale, model }: { locale: AppLocale; model: NonNullable<GuideModel> }) {
  const proof = model.activities.find((activity) => activity.key === "proof");
  const subscription = model.activities.some((activity) => activity.key === "subscription");
  const faq: { q: GuideKey; a: GuideKey }[] = [
    ...(subscription ? [{ q: "dkgFaqSubQ" as const, a: "dkgFaqSubA" as const }] : []),
    { q: "dkgFaqAmountQ", a: "dkgFaqAmountA" },
    { q: "dkgFaqResultQ", a: "dkgFaqResultA" },
    { q: "dkgFaqPrivacyQ", a: "dkgFaqPrivacyA" },
  ];
  return (
    <>
      <section className={styles.section} aria-labelledby="jjinfan-example">
        <h2 id="jjinfan-example">{guideText(locale, "dkgExTitle")}</h2>
        <ul className={styles.examples}>
          <ExampleCard locale={locale} good />
          <ExampleCard locale={locale} good={false} />
        </ul>
      </section>

      <section className={styles.section} aria-labelledby="jjinfan-benefit">
        <h2 id="jjinfan-benefit">{guideText(locale, "dkgBnTitle")}</h2>
        <ul className={styles.benefits}>
          {proof && proof.points !== null ? (
            <li>
              <span className={styles.ruleName}>{activityLabel(locale, "proof")}</span>
              <PointsCell locale={locale} activity={proof} />
            </li>
          ) : null}
          <li>
            <span className={styles.ruleName}>{proofsText(locale, "pfBoard")}</span>
            <span className={styles.sub}>{guideText(locale, "dkgBnBoard")}</span>
          </li>
          <li>
            <span className={styles.ruleName}>{proofsText(locale, "pfFanTitle", ["n"])}</span>
            <span className={styles.sub}>{guideText(locale, "dkgBnBadge", [proofsText(locale, "pfFanTitle", ["n"])])}</span>
          </li>
        </ul>
      </section>

      <section className={styles.section} aria-labelledby="jjinfan-faq">
        <h2 id="jjinfan-faq">{guideText(locale, "dkgFaqTitle")}</h2>
        <ul className={styles.faq}>
          {faq.map((item) => (
            <li key={item.q}>
              <h3>{guideText(locale, item.q)}</h3>
              <p>{guideText(locale, item.a)}</p>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

export function JjinfanGuideContent({ locale, model }: { locale: AppLocale; model: GuideModel }) {
  const open = model?.slots.filter((slot) => !slot.required).length ?? 0;
  return (
    <>
      <section className={styles.hero} aria-labelledby="jjinfan-guide-title">
        <h1 id="jjinfan-guide-title">{guideText(locale, "dkgJjTitle")}</h1>
        <GuideProgress locale={locale} />
      </section>

      <section className={styles.section} aria-labelledby="jjinfan-steps">
        <h2 id="jjinfan-steps">{guideText(locale, "dkgJjStepsTitle")}</h2>
        <ol className={styles.steps}>
          <li>
            <span className={styles.stepNo} aria-hidden="true">1</span>
            <div><h3>{guideText(locale, "dkgJjStep1Title")}</h3><p>{guideText(locale, "dkgJjStep1Desc")}</p></div>
          </li>
          <li>
            <span className={styles.stepNo} aria-hidden="true">2</span>
            <div><h3>{guideText(locale, "dkgJjStep2Title")}</h3><p>{model ? guideText(locale, "dkgJjStep2Desc", [open]) : ""}</p></div>
          </li>
          <li>
            <span className={styles.stepNo} aria-hidden="true">3</span>
            <div>
              <h3>{guideText(locale, "dkgJjStep3Title")}{model && !model.proofOpen ? <> <SoonBadge locale={locale} /></> : null}</h3>
              <p>{guideText(locale, "dkgJjStep3Desc")}</p>
            </div>
          </li>
        </ol>
      </section>

      <section className={styles.section} aria-labelledby="jjinfan-book">
        {model ? (
          <>
            <h2 id="jjinfan-book">{guideText(locale, "dkgJjBookTitle", [model.slots.length])}</h2>
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
        ) : (
          <>
            <h2 id="jjinfan-book">{guideText(locale, "dkgColSlot")}</h2>
            <Empty locale={locale} />
          </>
        )}
      </section>

      {model ? <ProofKinds locale={locale} open={model.proofOpen} /> : null}
      {model && model.proofOpen ? <ProofExtras locale={locale} model={model} /> : null}

      <nav className={styles.actions} aria-label={guideText(locale, "dkgLinkDukjil")}>
        <Link className={styles.primary} href={localeHref("/guide/dukjil", locale)}>{guideText(locale, "dkgLinkDukjil")}</Link>
        <GuideFansLink locale={locale} />
        <Link className={styles.secondary} href={localeHref("/rankings", locale)}>{rankingsText(locale, "rkTitle")}</Link>
      </nav>
      <GuideCta locale={locale} target="mission-book" returnPath="/guide/jjinfan" />
    </>
  );
}

export function DukjilGuideContent({ locale, model }: { locale: AppLocale; model: GuideModel }) {
  return (
    <>
      <section className={styles.hero} aria-labelledby="dukjil-guide-title">
        <h1 id="dukjil-guide-title">{guideText(locale, "dkgDkTitle")}</h1>
      </section>

      <section className={styles.section} aria-labelledby="dukjil-table">
        <h2 id="dukjil-table">{guideText(locale, "dkgDkTableTitle")}</h2>
        {model && model.activities.length > 0 ? (
          <ul className={styles.rules}>
            {model.activities.map((activity) => (
              <li key={activity.key} data-activity={activity.key}>
                <div className={styles.ruleHead}>
                  <span className={styles.ruleName}>{activityLabel(locale, activity.key)}</span>
                  {activity.soon ? <SoonBadge locale={locale} /> : null}
                </div>
                <div className={styles.ruleValue}><PointsCell locale={locale} activity={activity} /></div>
                <div className={styles.ruleMeta}>
                  {limitText(locale, activity) ? <span>{limitText(locale, activity)}</span> : null}
                  {activity.stamp ? <span>{guideText(locale, "dkgStamp")}</span> : null}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <Empty locale={locale} />
        )}
      </section>

      {model ? (
        <section className={styles.section} aria-labelledby="dukjil-stamp">
          <h2 id="dukjil-stamp">{guideText(locale, "dkgStampTitle")}</h2>
          <p className={styles.lead}>{guideText(locale, "dkgStampLead", [model.slots.length])}</p>
        </section>
      ) : null}

      {model ? (
        <section className={styles.section} aria-labelledby="dukjil-heart">
          <h2 id="dukjil-heart">{guideText(locale, "dkgHeartTitle")}</h2>
          <p className={styles.lead}>{guideText(locale, "dkgHeartLead", [model.slots.length, HEARTS_PER_PAGE])}</p>
        </section>
      ) : null}

      {model ? (
        <section className={styles.section} aria-labelledby="dukjil-rank">
          <h2 id="dukjil-rank">{guideText(locale, "dkgRankTitle")}</h2>
          <p className={styles.lead}>{guideText(locale, "dkgRankLead")}</p>
          <p className={styles.lead}>{guideText(locale, "dkgRankChallenge", [JJINFAN_CHALLENGE_TARGET])}</p>
          <div className={styles.actions}>
            <Link className={styles.secondary} href={localeHref("/rankings", locale)}>{rankingsText(locale, "rkTitle")}</Link>
          </div>
        </section>
      ) : null}

      <nav className={styles.actions} aria-label={guideText(locale, "dkgLinkJjinfan")}>
        <Link className={styles.primary} href={localeHref("/guide/jjinfan", locale)}>{guideText(locale, "dkgLinkJjinfan")}</Link>
        <GuideFansLink locale={locale} />
      </nav>
      <GuideCta locale={locale} target="fan-page" returnPath="/guide/dukjil" />
    </>
  );
}
