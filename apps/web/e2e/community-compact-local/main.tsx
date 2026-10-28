import { createRoot } from 'react-dom/client';
import { CommunityScreen } from '@/features/community/ui/community-screen';
import { parseCommunityTab } from '@/features/community/domain/navigation';
import { parseAppLocale } from '@/i18n/locales';
import type { PublishedCelebrity } from '@/server/content/content-domain';
import '@/app/globals.css';
import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css';
const query = new URLSearchParams(location.search), locale = parseAppLocale(query.get('locale'));
document.documentElement.lang = locale;
const creators: PublishedCelebrity[] = [
 ['elina', '엘리나', 125000], ['kara', 'KARA', 9800], ['yuna', '아주 긴 크리에이터 이름과 함께하는 Music Collective', 9800], ['music', 'Music Ensemble', 456], ['wave', 'kyaa WAVE', 321], ['new', 'New Creator', 0],
].map(([slug, name, fanCount], index) => ({ slug: String(slug), name: String(name), fanCount: Number(fanCount), displayOrder: index, locale: 'ko', summary: '함께 나누는 음악 이야기', image: { url: ['/images/guest-home/elina-card.jpg', '/images/guest-home/kara-card.jpg', '/images/celebrities/yuna/hero-studio-mobile.jpg', '/images/celebrities/changha/profile-20261021.webp', '/images/celebrities/wena/official-logo.jpg', '/images/celebrities/wena/official-logo.jpg'][index], alt: String(name), position: 'center' }, roles: [], themes: [], socialLinks: [] }));
if (query.get('names') === 'short') { creators[2] = { ...creators[2], name: 'Yuna' }; creators[3] = { ...creators[3], name: 'Changha' }; creators[4] = { ...creators[4], name: 'WENA' }; }
if (query.get('counts') === 'zero') creators.forEach(item => Object.assign(item, { fanCount: 0 }));
const creator = creators.find(item => item.slug === (query.get('creator') ?? 'elina'));
createRoot(document.getElementById('root')!).render(<CommunityScreen creators={creators} creator={creator} locale={locale} tab={parseCommunityTab(query.get('tab'))} mediaOnly={query.get('media') === '1'} />);
