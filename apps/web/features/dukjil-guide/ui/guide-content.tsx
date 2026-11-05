import type { Route } from "next";
import Link from "next/link";

import type { AppLocale } from "@/i18n/locales";
import type { GuideActivity, GuideModel, GuideSlot } from "../domain/guide-model";
import { rankingsText } from "@/features/rankings/ui/rankings-copy";
import { activityLabel, guideText, limitText, pointsText } from "./guide-copy";
import styles from "./guide-content.module.css";

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

export function JjinfanGuideContent({ locale, model }: { locale: AppLocale; model: GuideModel }) {
  const open = model?.slots.filter((slot) => !slot.required).length ?? 0;
  return (
    <>
      <section className={styles.hero} aria-labelledby="jjinfan-guide-title">
        <h1 id="jjinfan-guide-title">{guideText(locale, "dkgJjTitle")}</h1>
        <p className={styles.lead}>{guideText(locale, "dkgJjLead")}</p>
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
              <h3>{guideText(locale, "dkgJjStep3Title")} <SoonBadge locale={locale} /></h3>
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
                  <span className={styles.slotName}>{slotLabel(locale, slot)}</span>
                  {slot.required ? <span className={styles.badge}>{guideText(locale, "dkgRequired")}</span> : null}
                  {slot.activity?.soon ? <SoonBadge locale={locale} /> : null}
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

      <nav className={styles.actions} aria-label={guideText(locale, "dkgLinkDukjil")}>
        <Link className={styles.primary} href={localeHref("/guide/dukjil", locale)}>{guideText(locale, "dkgLinkDukjil")}</Link>
        <Link className={styles.secondary} href={localeHref("/celebrities", locale)}>{guideText(locale, "dkgCtaFans")}</Link>
        <Link className={styles.secondary} href={localeHref("/rankings", locale)}>{rankingsText(locale, "rkTitle")}</Link>
      </nav>
    </>
  );
}

export function DukjilGuideContent({ locale, model }: { locale: AppLocale; model: GuideModel }) {
  return (
    <>
      <section className={styles.hero} aria-labelledby="dukjil-guide-title">
        <h1 id="dukjil-guide-title">{guideText(locale, "dkgDkTitle")}</h1>
        <p className={styles.lead}>{guideText(locale, "dkgDkLead")}</p>
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

      <nav className={styles.actions} aria-label={guideText(locale, "dkgLinkJjinfan")}>
        <Link className={styles.primary} href={localeHref("/guide/jjinfan", locale)}>{guideText(locale, "dkgLinkJjinfan")}</Link>
        <Link className={styles.secondary} href={localeHref("/celebrities", locale)}>{guideText(locale, "dkgCtaFans")}</Link>
      </nav>
    </>
  );
}
