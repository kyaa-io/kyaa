import {fireEvent,render,screen} from '@testing-library/react';
import {expect,it,vi} from 'vitest';
import {GroupNotificationPanel} from './group-notification-panel';
const rows=[{id:'comment',label:'새 댓글',actionLabel:'게시글 보기',href:'/my?comment=1#reply'},{id:'report',label:'신고 처리 결과',actionLabel:'결과 보기',href:'/my?report=1'},{id:'verified',label:'인증 처리 결과',actionLabel:'내 인증 내역',href:'/my?verification=1'},{id:'raffle',label:'추첨 결과',actionLabel:'결과 보기',href:'/my?raffle=1'},{id:'receipt',label:'수령 결과',actionLabel:'수령 내역',href:'/my?receipt=1'}];
it('renders five supplied notifications and delegates opening without claiming delivery',()=>{
 const open=vi.fn();render(<GroupNotificationPanel locale='ko' rows={rows} onOpen={open}/>);
 expect(screen.getAllByRole('listitem')).toHaveLength(5);
 const link=screen.getByRole('link',{name:/게시글 보기/});expect(link).toHaveAttribute('href','/my?comment=1#reply');
 fireEvent.click(link);expect(open).toHaveBeenCalledWith('comment');
});
it('draws each notification as one link row: title, then action and time, not a two-column table',()=>{
 render(<GroupNotificationPanel locale='ko' rows={[{...rows[0],meta:'오후 3:00',unread:true}]} />);
 const link=screen.getByRole('link');
 expect(link).toHaveTextContent('새 댓글');expect(link).toHaveTextContent('게시글 보기 · 오후 3:00');
 expect(link).toHaveAttribute('data-unread','true');
 expect(screen.getByRole('listitem').children).toHaveLength(1);
});
