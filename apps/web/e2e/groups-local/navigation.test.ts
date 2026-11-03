import {afterEach,expect,it} from 'vitest';
import {act,cleanup,render,screen} from '@testing-library/react';
import {createElement} from 'react';
import {isClientFanRoute,useRouter,useSearchParams} from './navigation';
import {fixtureRoute} from './route';
afterEach(()=>{cleanup();document.querySelectorAll('a').forEach(a=>a.remove());});
it('ARCH001 fan client navigation updates subscribed content and preserves the mounted header',()=>{
 history.replaceState(null,'','/nchive?tab=home&source=official&auth=off');
 function Shell(){const params=useSearchParams(),router=useRouter();return createElement('div',null,createElement('h1',null,'NCHIVE'),createElement('output',null,params.get('tab')),createElement('button',{onClick:()=>router.push('/nchive?tab=members&source=official&auth=off')},'members'));}
 render(createElement(Shell));const header=screen.getByRole('heading');
 act(()=>useRouter().push('/nchive?tab=members&source=official&auth=off'));
 expect(screen.getByRole('status').textContent).toBe('members');expect(screen.getByRole('heading')).toBe(header);
 expect(fixtureRoute(location.pathname,location.search).view).toBe('creator');expect(new URLSearchParams(location.search).get('auth')).toBe('off');
 act(()=>{history.replaceState(null,'','/nchive?tab=home');window.dispatchEvent(new PopStateEvent('popstate'));});
 expect(screen.getByRole('status').textContent).toBe('home');expect(screen.getByRole('heading')).toBe(header);
});
it('ARCH001 only intercepts ordinary eligible links and leaves modified/external/download links native',()=>{
 history.replaceState(null,'','/elina?tab=home');
 const anchor=document.createElement('a');anchor.href='/elina?tab=members';document.body.append(anchor);
 const click=(options:MouseEventInit={})=>{const e=new MouseEvent('click',{bubbles:true,cancelable:true,...options});anchor.dispatchEvent(e);return e;};
 expect(click({ctrlKey:true}).defaultPrevented).toBe(false);
 anchor.download='file';expect(click().defaultPrevented).toBe(false);anchor.removeAttribute('download');
 anchor.target='_blank';expect(click().defaultPrevented).toBe(false);anchor.removeAttribute('target');
 expect(click().defaultPrevented).toBe(true);expect(location.search).toBe('?tab=members');
 expect(isClientFanRoute(new URL('https://example.test/elina'))).toBe(false);
 expect(isClientFanRoute(new URL('/my/wallet',location.href))).toBe(false);
 expect(isClientFanRoute(new URL('/pages/groups/e9200000-0000-4000-8000-000000000002',location.href))).toBe(true);
});
it('keeps local guest scenario in history without adding it to tab URLs',()=>{
 history.replaceState(null,'','/nchive?tab=home&auth=off');
 act(()=>useRouter().push('/nchive?tab=members'));
 expect(location.search).toBe('?tab=members');expect(history.state.fixtureAuth).toBe('off');
 act(()=>useRouter().push('/nchive?tab=board&auth=on'));
 expect(history.state.fixtureAuth).toBe('on');
});
