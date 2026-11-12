import { createRoot } from 'react-dom/client';
import { FanPostFeed } from '@/features/fan-posts/ui/fan-post-feed';
import { parseAppLocale } from '@/i18n/locales';
import '@/app/globals.css';
import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css';
const query = new URLSearchParams(location.search), locale = parseAppLocale(query.get('locale'));
document.documentElement.lang = locale;
const slug = query.get('creator') ?? 'elina';
createRoot(document.getElementById('root')!).render(<FanPostFeed slug={slug} locale={locale} mediaOnly={query.get('media') === '1'} hideHeading intro="" returnTo={`/${slug}?tab=board&locale=${locale}`} />);
