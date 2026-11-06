import {render,screen} from '@testing-library/react';
import {expect,it} from 'vitest';
import type {GroupDetail} from '../domain/contracts';
import {GroupSettingsPanel} from './group-settings-panel';
import {interactionCopy} from './interaction-copy';
import {managementCopy} from './management-copy';
import {APP_LOCALES} from '@/i18n/locales';
const id='10000000-0000-4000-8000-000000000001';
const detail=(role:'owner'|'manager'|'member',memberCount:number)=>({page:{id,kind:'hobby',celebrityId:null,slug:null,name:'모임',description:'소개',imageUrl:null,question:null,anonymous:false,memberCount},membership:{role,joinedAt:'2026-11-01'},bookmarked:false}) as unknown as GroupDetail;
const panel=(d:GroupDetail,locale:'ko'|'en'='ko')=><GroupSettingsPanel detail={d} locale={locale} pending={false} onSubmit={()=>{}} onImageReady={()=>{}} onLeave={()=>{}}/>;
it('links the owner to the members tab when someone can receive ownership',()=>{
 render(panel(detail('owner',2)));
 expect(screen.getByRole('link',{name:managementCopy('ko').transfer})).toHaveAttribute('href',`/pages/groups/${id}/manage?locale=ko&section=members`);
 expect(screen.getByText(interactionCopy('ko').transferFirst)).toBeInTheDocument();
});
it('disables the transfer action and says why when the owner is the only member',()=>{
 render(panel(detail('owner',1)));
 expect(screen.queryByRole('link',{name:managementCopy('ko').transfer})).not.toBeInTheDocument();
 expect(screen.getByRole('button',{name:managementCopy('ko').transfer})).toBeDisabled();
 expect(screen.getByText(interactionCopy('ko').transferAlone)).toBeInTheDocument();
 expect(screen.queryByText(interactionCopy('ko').transferFirst)).not.toBeInTheDocument();
});
it('has the alone-owner reason in every locale',()=>{
 for(const locale of APP_LOCALES)expect(interactionCopy(locale).transferAlone,locale).toBeTruthy();
});
