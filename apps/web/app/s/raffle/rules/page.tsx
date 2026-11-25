import { FanAppFrame } from '@/components/fan-shell/fan-app-shell';
import { FanContentContainer } from '@/components/fan-shell/fan-content-container';
import { FanHeading } from '@/components/fan-ui/fan-heading';
import { APP_LOCALES, APP_LOCALE_NATIVE_NAMES, parseAppLocale } from '@/i18n/locales';
import { raffleLongformText } from '@/i18n/catalogs/signup-raffle-longform';
import { rulesTitle } from './titles';
import styles from '../raffle.module.css';

export const metadata = { title: 'KYAA Raffle · Official rules' };
export default async function RulesPage({ searchParams }: {searchParams: Promise<{locale?: string}>}) {
  const locale = parseAppLocale((await searchParams).locale, 'en');
  const notices = ['notice1', 'notice2', 'notice4', 'notice3', 'notice9', 'notice8', 'notice5', 'notice6', 'notice7'] as const;
  return <FanAppFrame locale={locale} currentPath="/s/raffle/rules" mainId="rules-main">
    <FanContentContainer as="main" id="rules-main" className={styles.body}>
      <FanHeading as="h1">{rulesTitle[locale]}</FanHeading>
      <nav aria-label="Language">{APP_LOCALES.map(lang => <span key={lang}><a href={`?locale=${lang}`} lang={lang} aria-current={lang === locale ? 'page' : undefined}>{APP_LOCALE_NATIVE_NAMES[lang]}</a>{' '}</span>)}</nav>
      <section data-block="raffle-rules" className={styles.section}><FanHeading as="h2">KYAA Raffle · kyaa / SallyLab</FanHeading>
        <p lang="en">Entry is free. No purchase is necessary. English is the official version.</p>
        {notices.map(key => <p key={key}>{raffleLongformText(locale, key)}</p>)}
        <p>Visa · US$400 · $100 × 1 · $50 × 2 · $25 × 4 · $10 × 10</p>
        <p lang="en">We draw 17 winners at random, weighted by their chances. The claim deadline will be announced.</p>
        <p lang="en">Proposed eligibility, pending confirmation: ages 18 and over worldwide, excluding sanctioned countries.</p>
        <p lang="en">Meta, Google, Reddit and X do not sponsor, endorse or administer this raffle and are not affiliated with it.</p>
        <p><a href={`/privacy?locale=${locale}`}>Privacy policy</a> · <a href="mailto:support@kyaa.io">support@kyaa.io</a></p>
      </section>
    </FanContentContainer>
  </FanAppFrame>;
}
