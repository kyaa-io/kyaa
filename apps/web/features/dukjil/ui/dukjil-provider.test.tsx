import {render,screen,waitFor} from '@testing-library/react';
import {beforeEach,expect,it,vi} from 'vitest';
import {RequestTimeoutError} from '@/features/reliability/client/request-deadline';
import {DukjilProvider,resetDukjilCatalogCache,useDukjilStatus} from './dukjil-provider';
const state=vi.hoisted(()=>({request:undefined as any,today:0,ready:true}));
vi.mock('@/features/groups/ui/use-group-resource',()=>({useGroupRequest:()=>({authenticated:true,ready:state.ready,ownerKey:'u',request:state.request}),useGroupResource:(path:string|null)=>{if(path)state.today+=1;return {data:undefined,failure:undefined,retry:()=>{}};}}));
function Probe(){const s=useDukjilStatus('ko');return <p data-testid='s'>{s}</p>;}
beforeEach(()=>{resetDukjilCatalogCache();state.today=0;state.ready=true;});
it('a catalog request that times out ends as off, not as loading forever',async()=>{
 state.request=vi.fn().mockRejectedValue(new RequestTimeoutError());
 render(<Probe/>);
 expect(screen.getByTestId('s').textContent).toBe('loading');
 await waitFor(()=>expect(screen.getByTestId('s').textContent).toBe('off'));
});
it('without an active catalog the provider reads no today data',async()=>{
 state.request=vi.fn().mockRejectedValue(new RequestTimeoutError());
 render(<DukjilProvider slug='a' locale='ko'><Probe/></DukjilProvider>);
 await waitFor(()=>expect(screen.getByTestId('s').textContent).toBe('off'));
 expect(state.today).toBe(0);
});
it('nested providers for the same creator share one catalog read',async()=>{
 state.request=vi.fn().mockRejectedValue(new Error('x'));
 render(<DukjilProvider slug='a' locale='ko'><DukjilProvider slug='a' locale='ko'><Probe/></DukjilProvider></DukjilProvider>);
 await waitFor(()=>expect(screen.getByTestId('s').textContent).toBe('off'));
 expect(state.request).toHaveBeenCalledTimes(1);
});
it('does not read the catalog before the session is known, so the status never flips to off on the way to on',async()=>{
 state.ready=false;
 const refused=vi.fn().mockRejectedValue(new Error('SESSION_NOT_READY'));
 state.request=refused;
 const seen:string[]=[];
 function Track(){const s=useDukjilStatus('ko');if(seen.at(-1)!==s)seen.push(s);return <p data-testid='s'>{s}</p>;}
 const view=render(<Track/>);
 await new Promise(resolve=>setTimeout(resolve,20));
 expect(refused).not.toHaveBeenCalled();
 state.ready=true;
 state.request=vi.fn().mockResolvedValue({rules:[]});
 view.rerender(<Track/>);
 await waitFor(()=>expect(state.request).toHaveBeenCalledTimes(1));
 expect(seen[0]).toBe('loading');
 expect(seen.slice(0,-1)).not.toContain('off');
});
