import {expect,it} from 'vitest';
import {messages} from '@/i18n/catalogs/features__groups__ui__group-apply-copy';
import {APP_LOCALES} from '@/i18n/locales';
import {groupApplyText} from './group-apply-copy';
import {groupApplySource} from './group-apply-source';
it('fills every language for every application label',()=>{
 expect(Object.keys(messages).sort()).toEqual(Object.keys(groupApplySource).sort());
 for(const key of Object.keys(groupApplySource) as (keyof typeof groupApplySource)[])for(const locale of APP_LOCALES)expect(groupApplyText(locale,key).trim(),`${key}/${locale}`).toBeTruthy();
});
it('uses the Korean and English source text',()=>{expect(groupApplyText('ko','existingPageQuestion')).toBe('기존에 운영하던 페이지가 있나요?');expect(groupApplyText('en','viewMine')).toBe('View my applications');});
