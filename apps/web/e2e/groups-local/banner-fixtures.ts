import type { AppLocale } from '@/i18n/locales';
import type { HomeBanner } from '@/features/home/domain/home-banner';
import { toContentLocale } from '@/i18n/locales';
import snapshot from './home-banner-snapshot.json';

// Public managed home banners captured from kyaa.io on 2026-11-03; local review only.
export function discoveryBannerFixtures(locale:AppLocale):HomeBanner[]{
 return snapshot[toContentLocale(locale)] as HomeBanner[];
}

// Placeholder guide banners (draft art, Korean-only text) for local review of the groups spotlight; not captured from any live site.
const guideAsset=(slug:string,kind:'desktop'|'mobile',width:number,height:number)=>({id:`${slug==='jjinfan'?'a':'b'}0000000-0000-4000-8000-00000000000${kind==='desktop'?1:2}`,url:`/guide-banner-assets/${slug}-${kind}.webp`,width,height,mimeType:'image/webp',revision:1});
const guideBanner=(slug:'jjinfan'|'dukjil',title:Record<'ko'|'en',string>,locale:AppLocale):HomeBanner=>{const content=toContentLocale(locale);return {id:`${slug==='jjinfan'?'a':'b'}0000000-0000-4000-8000-000000000000`,kind:'announcement',celebrityId:null,category:'guide',title:title[content],description:'',ctaLabel:content==='ko'?'보기':'View',href:`/guide/${slug}`,alt:title[content],desktopImage:guideAsset(slug,'desktop',1638,819),mobileImage:guideAsset(slug,'mobile',704,880)};};
export function discoveryGuideBannerFixtures(locale:AppLocale):HomeBanner[]{
 return [guideBanner('jjinfan',{ko:'찐팬 되는 법',en:'How to become a true fan'},locale),guideBanner('dukjil',{ko:'덕질하는 법',en:'How to earn as a fan'},locale)];
}
