import { createRoot } from 'react-dom/client';
import { parseAppLocale } from '../../i18n/locales';
import { RaffleContent } from '../../app/s/raffle/content';
import { ManagedHomeBanner } from '../../components/home-entry-cards/managed-home-banner';
import { signupRaffleHomeBanner } from '../../features/home/domain/signup-raffle-home-banner';
import styles from '../../app/s/raffle/raffle.module.css';
import homeStyles from '../../components/guest-home.module.css';
import '../../app/globals.css';
const params = new URLSearchParams(location.search), locale = parseAppLocale(params.get('locale'));
createRoot(document.getElementById('root')!).render(<main style={{margin: '0 auto', maxWidth: 1360, padding: 16}}>
  {params.has('banner') ? <div className={homeStyles.heroViewport}><ManagedHomeBanner banner={signupRaffleHomeBanner(locale)} locale={locale} /></div> : <div className={styles.event}><RaffleContent locale={locale} /></div>}
</main>);
