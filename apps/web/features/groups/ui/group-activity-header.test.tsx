import {render,screen} from '@testing-library/react';
import {beforeEach,expect,it,vi} from 'vitest';
import {GroupActivityHeader} from './group-activity-header';
const state=vi.hoisted(()=>({page:undefined as any,creator:undefined as any,pageError:false,creatorError:false,urls:[] as (string|null)[]}));
vi.mock('./use-group-resource',()=>({useGroupResource:(url:string|null)=>{state.urls.push(url);return url?.startsWith('/api/groups/')?{data:state.page,error:state.pageError}:{data:state.creator,error:state.creatorError};}}));
vi.mock('./creator-group-header',()=>({CreatorGroupHeader:({celebrity,locale}:any)=><header>{celebrity.name}:{locale}</header>}));
const id='e9200000-0000-4000-8000-000000000001';
beforeEach(()=>{state.page={page:{id,kind:'fan',slug:'nchive',celebrityId:id}};state.creator={slug:'nchive',name:'원문 이름',roles:['idol']};state.pageError=false;state.creatorError=false;state.urls=[];});
it('reuses the exact linked public creator without changing locale or navigation',()=>{
 render(<GroupActivityHeader pageId={id} locale='ko'/>);
 expect(state.urls).toEqual([`/api/groups/${id}`,'/api/public/celebrities/nchive?locale=ko']);
 expect(screen.getByRole('banner')).toHaveTextContent('원문 이름:ko');
});
it.each([{kind:'hobby'},{kind:'brand'},{celebrityId:null},{slug:null},{slug:'../nchive'},{slug:'pages'},{id:'another-id'}])('does not fetch creator for an unverified link %j',patch=>{
 Object.assign(state.page.page,patch);render(<GroupActivityHeader pageId={id} locale='ko'/>);
 expect(state.urls[1]).toBeNull();expect(screen.queryByRole('banner')).toBeNull();
});
it.each(['missing','denied'])('does not show a creator after group %s',condition=>{
 if(condition==='missing')state.page=undefined;else state.pageError=true;
 render(<GroupActivityHeader pageId={id} locale='ko'/>);
 expect(state.urls[1]).toBeNull();expect(screen.queryByRole('banner')).toBeNull();
});
it.each(['different-slug','brand','failed'])('rejects mismatched/unavailable public creator: %s',condition=>{
 if(condition==='different-slug')state.creator.slug='elina';else if(condition==='brand')state.creator.roles=['brand'];else state.creatorError=true;
 render(<GroupActivityHeader pageId={id} locale='ko'/>);expect(screen.queryByRole('banner')).toBeNull();
});
