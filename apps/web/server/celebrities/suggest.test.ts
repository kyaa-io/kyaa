import {describe,expect,it,vi} from 'vitest';
vi.mock('server-only',()=>({}));
import {AuthError} from '@/features/auth/domain/auth-errors';
import {createCelebritySuggestHandler} from './suggest';
const me='e9400000-0000-4000-8000-000000000001';
const dictionary={name:'아이유',secondaryName:'IU',category:'singer',page:null};
const published={name:'엘리나',secondaryName:'Elina',category:null,page:{slug:'elina'}};
function setup(items:unknown[]=[dictionary]){const rpc=vi.fn().mockResolvedValue({items}),authorize=vi.fn(async(auth:string|null)=>{if(auth!=='Bearer valid')throw new AuthError('AUTHENTICATION_REQUIRED',401,'Login');return{appUserId:me};});return{rpc,authorize,handler:createCelebritySuggestHandler({rpc,authorize})};}
const req=(query:string,auth:string|null='Bearer valid')=>new Request(`https://kyaa.test/api/celebrities/suggest${query}`,{headers:auth?{authorization:auth}:{}});
describe('celebrity name suggest',()=>{
 it('requires a login',async()=>{const s=setup();expect((await s.handler(req('?q=아',null))).status).toBe(401);expect((await s.handler(req('?q=아','bad'))).status).toBe(401);expect(s.rpc).not.toHaveBeenCalled();});
 it('passes a bounded query to the database',async()=>{const s=setup([dictionary,published]);const r=await s.handler(req('?q=%20아이%20&limit=5&locale=en'));expect(r.status).toBe(200);expect(s.rpc).toHaveBeenCalledWith('celebrity_name_suggest',{p_query:'아이',p_limit:5,p_locale:'en'});expect(await r.json()).toEqual({items:[dictionary,published]});expect(r.headers.get('cache-control')).toContain('private');expect(r.headers.get('vary')).toContain('Authorization');});
 it('defaults the limit and language',async()=>{const s=setup();await s.handler(req('?q=아'));expect(s.rpc).toHaveBeenCalledWith('celebrity_name_suggest',{p_query:'아',p_limit:8,p_locale:'ko'});});
 it('answers an empty list for a blank query without reading',async()=>{const s=setup();for(const q of ['','?q=','?q=%20%20']){const r=await s.handler(req(q));expect(r.status).toBe(200);expect(await r.json()).toEqual({items:[]});}expect(s.rpc).not.toHaveBeenCalled();});
 it('rejects input outside the contract',async()=>{const s=setup();for(const q of [`?q=${'가'.repeat(51)}`,'?q=a%00b','?q=a%0Ab','?q=a&q=b','?q=a&limit=0','?q=a&limit=21','?q=a&limit=x','?q=a&locale=xx'])expect((await s.handler(req(q))).status,q).toBe(400);expect(s.rpc).not.toHaveBeenCalled();});
 it('keeps only the fields of the contract',async()=>{const s=setup([{...dictionary,sourceId:'Q1',popularity:9}]);expect(await (await s.handler(req('?q=아'))).json()).toEqual({items:[dictionary]});});
 it('fails closed and hides database errors',async()=>{const s=setup();s.rpc.mockRejectedValue(new Error('private row'));const r=await s.handler(req('?q=아'));expect(r.status).toBe(503);expect(await r.text()).not.toContain('private');});
});
