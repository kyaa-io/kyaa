import {fireEvent,render,screen} from '@testing-library/react';
import {expect,it,vi} from 'vitest';
import {GroupActivityFrame} from './group-activity-frame';
const resource=vi.hoisted(()=>vi.fn(()=>({data:{page:{id:'scope',name:'Must not render group identity',kind:'fan',memberCount:1}},error:false})));
vi.mock('./use-group-resource',()=>({useGroupResource:resource}));
vi.mock('./group-shell',()=>({GroupShell:({children,currentPath}:any)=><div data-testid="shell" data-path={currentPath}>{children}</div>,GroupAvatar:()=>null}));
vi.mock('@/components/fan-shell/fan-app-shell',()=>({FanAppFrame:({children,currentPath}:any)=><div data-testid="shell" data-path={currentPath}>{children}</div>,FanContentContainer:({children}:any)=><main>{children}</main>}));
vi.mock('@/features/group-wallet/ui/wallet-screen',()=>({WalletAttendanceDialog:({onClose}:{onClose:()=>void})=><div role="dialog"><button onClick={onClose}>닫기</button></div>}));
it.each([false,true])('renders a global benefits frame without using API scope as group context (%s)',standalone=>{
 render(<GroupActivityFrame locale="ko" pageId="scope" standalone={standalone} title="Activity"><p>Real activity</p></GroupActivityFrame>);
 expect(screen.getByTestId('shell')).toHaveAttribute('data-path','/benefits');
 expect(screen.queryByText('Must not render group identity')).not.toBeInTheDocument();
 expect(screen.queryByRole('navigation',{name:'Must not render group identity'})).not.toBeInTheDocument();
 expect(resource).not.toHaveBeenCalled();
});
it('opens attendance in context while preserving modified link navigation',()=>{
 render(<GroupActivityFrame locale="ko" title="Activity"><p>Real activity</p></GroupActivityFrame>);
 const link=screen.getByRole('link',{name:'출석체크'});
 expect(link).toHaveAttribute('href','/my/wallet?view=attendance&locale=ko');
 expect(fireEvent.click(link,{ctrlKey:true})).toBe(true);
 expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
 expect(fireEvent.click(link)).toBe(false);
 expect(screen.getByRole('dialog')).toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'닫기'}));
 expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});
