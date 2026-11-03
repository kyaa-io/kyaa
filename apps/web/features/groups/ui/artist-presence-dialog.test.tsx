import {render,screen,fireEvent} from '@testing-library/react';
import {describe,it,expect,vi} from 'vitest';
import {ArtistPresenceDialog} from './artist-presence-dialog';
vi.mock('@/components/ui/overlay/accessible-overlay',()=>({AccessibleOverlay:({children}:{children:React.ReactNode})=><div role='dialog'>{children}</div>}));
describe('artist presence source dialog',()=>{
 it('keeps the toggle local until save and preserves it on failure',()=>{const save=vi.fn(),close=vi.fn(),props={locale:'ko' as const,enabled:true,pending:false,failed:false,onClose:close,onSave:save};const view=render(<ArtistPresenceDialog {...props}/>);fireEvent.click(screen.getByRole('switch'));expect(save).not.toHaveBeenCalled();fireEvent.click(screen.getByText('설정 저장'));expect(save).toHaveBeenCalledWith(false);view.rerender(<ArtistPresenceDialog {...props} failed/>);expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe('false');expect(screen.getByRole('alert')).toBeTruthy();fireEvent.click(screen.getByText('취소'));expect(close).toHaveBeenCalledOnce();});
 it('disables draft and actions during a pending save',()=>{render(<ArtistPresenceDialog locale='ko' enabled pending failed={false} onClose={vi.fn()} onSave={vi.fn()}/>);expect(screen.getByRole('switch').hasAttribute('disabled')).toBe(true);expect(screen.getByRole('button',{name:'설정 저장'}).hasAttribute('disabled')).toBe(true);});
});
