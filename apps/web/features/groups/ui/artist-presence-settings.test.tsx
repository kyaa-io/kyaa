import {render,screen,fireEvent,waitFor} from '@testing-library/react';
import {describe,it,expect,vi,beforeEach} from 'vitest';
import type {ReactNode} from 'react';
import {ArtistPresenceSettings} from './artist-presence-settings';
const fixture=vi.hoisted(()=>({canConfigure:true,request:vi.fn(),retry:vi.fn(),push:vi.fn()}));
vi.mock('next/navigation',()=>({useRouter:()=>({push:fixture.push})}));
vi.mock('./use-group-resource',()=>({useGroupResource:()=>({ready:true,authenticated:true,error:null,data:{enabled:true,canConfigure:fixture.canConfigure},request:fixture.request,retry:fixture.retry})}));
vi.mock('@/components/fan-shell/fan-app-shell',()=>({FanAppFrame:({children}:{children:ReactNode})=><>{children}</>}));
vi.mock('@/features/profile/ui/group-settings-menu',()=>({GroupSettingsMenu:()=> <main>설정</main>}));
beforeEach(()=>{fixture.canConfigure=true;fixture.request.mockReset().mockResolvedValue({});fixture.push.mockReset();fixture.retry.mockReset();});
describe('MY presence task',()=>{
 it('sends only a saved draft through the existing authorized PUT and then returns to settings',async()=>{render(<ArtistPresenceSettings locale='ko' previewName='엔카이브'/>);const toggle=await screen.findByRole('switch');fireEvent.click(toggle);expect(fixture.request).not.toHaveBeenCalled();fireEvent.click(screen.getByRole('button',{name:'설정 저장'}));await waitFor(()=>expect(fixture.request).toHaveBeenCalledWith('/api/groups/me/presence',{method:'PUT',body:JSON.stringify({enabled:false})}));await waitFor(()=>expect(fixture.push).toHaveBeenCalledWith('/settings?locale=ko'));});
 it('retains the changed draft with inline feedback after a failed save',async()=>{fixture.request.mockRejectedValue(new Error('unavailable'));render(<ArtistPresenceSettings locale='ko'/>);fireEvent.click(await screen.findByRole('switch'));fireEvent.click(screen.getByRole('button',{name:'설정 저장'}));expect(await screen.findByRole('alert')).toBeInTheDocument();expect(screen.getByRole('switch')).toHaveAttribute('aria-checked','false');expect(fixture.push).not.toHaveBeenCalled();});
 it('does not expose the task without the actual artist capability',()=>{fixture.canConfigure=false;render(<ArtistPresenceSettings locale='ko'/>);expect(screen.queryByRole('dialog')).not.toBeInTheDocument();expect(screen.getByText('아티스트 계정에서 설정할 수 있어요.')).toBeInTheDocument();expect(fixture.request).not.toHaveBeenCalled();});
});
