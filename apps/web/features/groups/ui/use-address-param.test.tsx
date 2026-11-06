import {act,renderHook} from '@testing-library/react';
import {beforeEach,expect,it,vi} from 'vitest';
import {useAddressParam} from './use-address-param';
const nav=vi.hoisted(()=>({search:new URLSearchParams()}));
vi.mock('next/navigation',()=>({useSearchParams:()=>nav.search}));
beforeEach(()=>{window.history.replaceState(null,'','/manage?locale=ko&section=members&gift=1');nav.search=new URLSearchParams(window.location.search);});
it('changes at once, keeps other values and clears the named ones',()=>{
 const {result}=renderHook(()=>useAddressParam('section'));
 act(()=>result.current[1]('settings',['gift']));
 expect(result.current[0]).toBe('settings');
 expect(window.location.search).toBe('?locale=ko&section=settings');
});
it('follows the address when a link changes it, even back to the earlier value',()=>{
 const {result,rerender}=renderHook(()=>useAddressParam('section'));
 act(()=>result.current[1]('settings'));
 nav.search=new URLSearchParams('section=settings');rerender();
 expect(result.current[0]).toBe('settings');
 nav.search=new URLSearchParams('section=members');rerender();
 expect(result.current[0]).toBe('members');
});
it('removes the value when set to null',()=>{
 const {result}=renderHook(()=>useAddressParam('gift'));
 act(()=>result.current[1](null));
 expect(result.current[0]).toBeNull();
 expect(window.location.search).toBe('?locale=ko&section=members');
});
