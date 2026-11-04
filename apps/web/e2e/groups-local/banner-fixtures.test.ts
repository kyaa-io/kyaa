import { describe, expect, it } from 'vitest';
import { homeBannerSchema } from '@/features/home/domain/home-banner';
import { APP_LOCALES, toContentLocale } from '@/i18n/locales';
import { discoveryBannerFixtures } from './banner-fixtures';
import snapshot from './home-banner-snapshot.json';

describe('managed home banner review snapshot',()=>{
 it('keeps published source order, destinations, and valid assets for each supported locale',()=>{
  for(const locale of APP_LOCALES){
   const rows=discoveryBannerFixtures(locale);
   expect(homeBannerSchema.array().parse(rows)).toEqual(snapshot[toContentLocale(locale)]);
   expect(rows.map(row=>[row.id,row.href])).toEqual([
    ['dc9d6dce-2df6-4dfe-830a-e3ebdce7e2ad','/wena'],
    ['3fbcb2e9-f719-4581-a852-eaf9e2ddf840','/nchive'],
   ]);
  }
 });
});
