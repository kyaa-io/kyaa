import {cleanup,render} from '@testing-library/react';
import {afterEach,expect,it} from 'vitest';
import {CreatorBoardAside} from './creator-board-aside';
afterEach(cleanup);
it('keeps challenge, activity, grade and event content off the board even with an event',()=>{
 const view=render(<CreatorBoardAside slug='nchive' locale='ko' event={{title:'실제 이벤트 제목',image:'/images/groups/nchive-prize-pencil.png',href:'/nchive?tab=events',exchangeHref:'/my/wallet?view=tickets'}}/>);
 expect(view.container).toBeEmptyDOMElement();
});
