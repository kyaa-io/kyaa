import type { AppLocale } from '@/i18n/locales';
import type { HomeBanner } from '@/features/home/domain/home-banner';
import { toContentLocale } from '@/i18n/locales';
import snapshot from './home-banner-snapshot.json';

// Public managed home banners captured from kyaa.io on 2026-11-03; local review only.
export function discoveryBannerFixtures(locale:AppLocale):HomeBanner[]{
 return snapshot[toContentLocale(locale)] as HomeBanner[];
}
