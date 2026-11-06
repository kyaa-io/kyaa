import {expect,it} from 'vitest';
import {messages} from '@/i18n/catalogs/features__groups__ui__manage-source';
import {APP_LOCALES} from '@/i18n/locales';
import {manageSource} from './manage-source';
it('fills every locale and keeps every placeholder',()=>{
 const holes=(text:string)=>(text.match(/\{\d+\}/g)??[]).sort();
 expect(Object.keys(messages).sort()).toEqual(Object.keys(manageSource).sort());
 for(const [key,source] of Object.entries(manageSource))for(const locale of APP_LOCALES.filter(item=>item!=='ko'&&item!=='en')){
  const text=(messages as Record<string,Record<string,string>>)[key][locale];
  expect(text?.trim(),`${key}/${locale}`).toBeTruthy();
  expect(holes(text),`${key}/${locale}`).toEqual(holes(source.en));
 }
});
