import '@testing-library/jest-dom/vitest';
import {fireEvent,render,screen,waitFor} from '@testing-library/react';
import {expect,it,vi} from 'vitest';
import {GroupHomeInfo} from './group-home-panels';
import type {GroupPage} from '../domain/contracts';
vi.mock('./use-group-presence',()=>({useGroupPresence:()=>({data:undefined,error:false})}));
vi.mock('@/features/group-wallet/ui/wallet-screen',()=>({WalletAttendanceDialog:({onClose}:{onClose:()=>void})=><div role="dialog"><button onClick={onClose}>닫기</button></div>}));
const page={id:'e9200000-0000-4000-8000-000000000003',description:'모임 소개',memberCount:1} as GroupPage;
it('opens attendance only for an ordinary click and retains the direct link',async()=>{
 const fetcher=vi.spyOn(globalThis,'fetch');render(<GroupHomeInfo page={page} locale="ko"/>);
 const link=screen.getByRole('link',{name:'출석체크'});expect(link).toHaveAttribute('href','/my/wallet?locale=ko&view=attendance');
 expect(fireEvent.click(link,{button:0,ctrlKey:true})).toBe(true);expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
 expect(fireEvent.click(link,{button:0})).toBe(false);expect(screen.getByRole('dialog')).toBeVisible();expect(fetcher).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'닫기'}));expect(screen.queryByRole('dialog')).not.toBeInTheDocument();await waitFor(()=>expect(link).toHaveFocus());fetcher.mockRestore();
});
