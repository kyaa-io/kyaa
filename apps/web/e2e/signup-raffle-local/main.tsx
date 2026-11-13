import { createRoot } from 'react-dom/client';
import { parseAppLocale } from '../../i18n/locales';
import { RaffleContent } from '../../app/s/raffle/content';
import { ManagedHomeBanner } from '../../components/home-entry-cards/managed-home-banner';
import { signupRaffleHomeBanner } from '../../features/home/domain/signup-raffle-home-banner';
import styles from '../../app/s/raffle/raffle.module.css';
import homeStyles from '../../components/guest-home.module.css';
import '../../app/globals.css';
const params = new URLSearchParams(location.search), locale = parseAppLocale(params.get('locale'));
// ?preview=closed: 마감 뒤 추첨 전 · won|lost: 추첨 뒤 결과 화면(표시 전용 예시 값, 서버·추첨과 무관)
const preview = (['in', 'entered', 'passport', 'done', 'error', 'won', 'lost'] as const).find(value => value === params.get('preview'));
createRoot(document.getElementById('root')!).render(<main style={{margin: '0 auto', maxWidth: 1360, padding: 16}}>
  {params.has('banner') ? <div className={homeStyles.heroViewport}><ManagedHomeBanner banner={signupRaffleHomeBanner(locale)} locale={locale} /></div> : <div className={styles.event}><RaffleContent locale={locale} closesAt={Date.now() + 18 * 86_400_000} now={Date.now()} closed={preview === 'won' || preview === 'lost' || params.get('preview') === 'closed'} preview={preview} /></div>}
</main>);
