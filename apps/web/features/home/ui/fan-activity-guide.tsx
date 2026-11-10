import { FanHeading } from "@/components/fan-ui/fan-heading";
import Link from "next/link";
import type { Route } from "next";
import { serviceGuideContent } from "@/components/service-guide/content";
import type { AppLocale } from "@/i18n/locales";
import styles from "./fan-activity-guide.module.css";

export function FanActivityGuide({ locale }: { locale: AppLocale }) {
  const guide = serviceGuideContent[locale];
  const ko = locale === "ko";
  const en = locale === "en";
  const intro = ko ? "최애를 찾고 팬 인증을 완료해 보세요. 팬 패스포트를 받은 뒤 참여할 수 있는 활동을 확인할 수 있어요." : guide.description;
  const steps = [
    { title: ko ? "최애 찾기" : guide.primaryAction, body: ko ? "좋아하는 크리에이터의 팬페이지를 찾아보세요." : guide.steps[0].description, href: "/celebrities", action: guide.primaryAction },
    { title: ko ? "퀴즈로 팬 인증" : en ? "Take the fan quiz" : guide.steps[0].title, body: ko ? "최애의 퀴즈를 통과하면 팬 인증이 완료돼요." : guide.steps[0].description },
    { title: ko ? "팬 패스포트 확인" : en ? "See your Fan Passport" : guide.passportTitle, body: `${guide.passportPoints[0]} ${guide.passportDescription}`, href: "/passports", action: ko ? "패스포트 보기" : en ? "View Passports" : guide.passportTitle },
    { title: ko ? "LIVE와 혜택 참여" : en ? "Explore LIVE and benefits" : guide.overviewTitle, body: ko ? "참여하고 싶은 LIVE와 혜택을 살펴보고, 각 화면에서 조건과 기간을 확인해 주세요." : guide.description, href: "/live", action: guide.secondaryAction },
  ];
  return <div className={styles.guide}>
    <div className={styles.intro}><p>{intro}</p></div>
    <img className={styles.heroImage} src="/images/notices/fan-activity-guide.webp" width={1254} height={1254} alt="" />
    <ol className={styles.steps}>{steps.map((step, index) => <li key={index} data-row="guide-step">
      <span className={styles.number}>{String(index + 1).padStart(2, "0")}</span>
      <div><FanHeading>{step.title}</FanHeading><p>{step.body}</p>{step.href && <Link href={`${step.href}?locale=${locale}` as Route}>{step.action}<span aria-hidden="true"> ›</span></Link>}{index === 3 && <Link href={`/benefits?locale=${locale}` as Route}>{ko ? "혜택 보기" : en ? "View benefits" : guide.steps[3].title}<span aria-hidden="true"> ›</span></Link>}</div>
    </li>)}</ol>
  </div>;
}
