import {fireEvent,render,screen} from '@testing-library/react';
import {expect,it,vi} from 'vitest';
import {APP_LOCALES} from '@/i18n/locales';
import {GroupSettingsMenu} from './group-settings-menu';
const state=vi.hoisted(()=>({authenticated:true,canConfigure:false}));
vi.mock('@/features/groups/ui/use-group-resource',()=>({useGroupRequest:()=>({authenticated:state.authenticated}),useGroupResource:()=>({data:{enabled:true,canConfigure:state.canConfigure}})}));
it('shows artist presence only with the actual capability and preserves section navigation',()=>{
 state.canConfigure=false;const selected=vi.fn();
 const view=render(<GroupSettingsMenu locale='ko' onSelect={selected}/>);
 expect(screen.queryByRole('link',{name:'접속 상태 공개'})).toBeNull();
 fireEvent.click(screen.getByRole('link',{name:'프로필'}));expect(selected).toHaveBeenCalledWith('profile');
 expect(screen.getByRole('link',{name:'연결 및 수신 채널'})).toHaveAttribute('href','/settings?locale=ko&section=channels');
 state.canConfigure=true;view.rerender(<GroupSettingsMenu locale='ko'/>);
 expect(screen.getByRole('link',{name:'접속 상태 공개'})).toHaveAttribute('href','/my/presence?locale=ko');state.canConfigure=false;
});
it.each(APP_LOCALES)('provides all source menu entries for %s',locale=>{
 state.canConfigure=false;render(<GroupSettingsMenu locale={locale}/>);
 expect(screen.getAllByRole('link')).toHaveLength(9);
 for(const link of screen.getAllByRole('link'))expect(link).toHaveTextContent(/\S/);
});
