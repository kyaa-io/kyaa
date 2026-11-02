import {render,screen,fireEvent,within} from '@testing-library/react';
import {describe,it,expect,vi,beforeEach} from 'vitest';
import {GroupLanguageDialog} from './group-language-dialog';
const router=vi.hoisted(()=>({push:vi.fn()}));
vi.mock('next/navigation',()=>({useRouter:()=>router}));
beforeEach(()=>router.push.mockReset());
describe('shared task language dialog',()=>{
 it('applies a selected language immediately while retaining the current route and query',async()=>{const close=vi.fn();render(<GroupLanguageDialog locale='ko' href='/nchive?tab=calendar&month=2026-11#calendar' onClose={close}/>);const dialog=await screen.findByRole('dialog',{name:'언어 선택'});expect(within(dialog).getAllByRole('button').filter(button=>button.hasAttribute('aria-pressed'))).toHaveLength(12);expect(within(dialog).queryByRole('button',{name:'저장'})).not.toBeInTheDocument();fireEvent.click(within(dialog).getByRole('button',{name:/^English/}));expect(close).toHaveBeenCalledOnce();const target=new URL(router.push.mock.calls[0]![0],'https://local.test');expect(target.pathname).toBe('/nchive');expect(target.searchParams.get('month')).toBe('2026-11');expect(target.searchParams.get('locale')).toBe('en');expect(target.hash).toBe('#calendar');});
 it('closes an already selected language without navigating',async()=>{const close=vi.fn();render(<GroupLanguageDialog locale='ko' href='/pages/groups?locale=ko' onClose={close}/>);const dialog=await screen.findByRole('dialog');fireEvent.click(within(dialog).getByRole('button',{name:/^한국어/}));expect(close).toHaveBeenCalledOnce();expect(router.push).not.toHaveBeenCalled();});
});
