import {cleanup,render,screen} from '@testing-library/react';
import {afterEach,expect,it} from 'vitest';
import {CreatorBoardAside} from './creator-board-aside';
afterEach(cleanup);
it('shows activity destinations without inventing an event',()=>{
 render(<CreatorBoardAside slug='nchive' locale='ko'/>);
 expect(screen.getByRole('link',{name:'출석 확인'})).toHaveAttribute('href','/my/wallet?view=attendance&locale=ko');
 expect(screen.queryByRole('img',{name:'굿즈'})).toBeNull();
 expect(screen.queryByText('굿즈 추첨 이벤트')).toBeNull();
});
it('only shows event artwork and actions when the caller supplies the event',()=>{
 render(<CreatorBoardAside slug='nchive' locale='ko' event={{title:'실제 이벤트 제목',image:'/images/groups/nchive-prize-pencil.png',href:'/nchive?tab=events',exchangeHref:'/my/wallet?view=tickets'}}/>);
 expect(screen.getByRole('link',{name:'실제 이벤트 제목'})).toHaveAttribute('href','/nchive?tab=events');
 expect(screen.getByRole('link',{name:'응모권 교환'})).toHaveAttribute('href','/my/wallet?view=tickets');
});
