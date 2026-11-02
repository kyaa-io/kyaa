import {render,screen} from '@testing-library/react';
import {expect,it} from 'vitest';
import {CreatorVideoDetail} from './creator-video-detail';
it('preserves original video text and delegates the actual player and comments',()=>{
 render(<CreatorVideoDetail locale='ko' title='원문 영상 제목' source='NCHIVE · YouTube' originalHref='https://youtube.com/watch?v=original' originalLabel='YouTube에서 보기' backHref='/nchive?tab=board' player={<video aria-label='원본 플레이어' controls/>} commentCount={3} commentSourceNote='이 영상에 대한 kyaa 댓글이에요. YouTube 댓글과는 별개예요.' comments={<form><textarea aria-label='댓글'/><button>등록</button></form>}/>);
 expect(screen.getByRole('heading',{level:1})).toHaveTextContent('원문 영상 제목');
 expect(screen.getByRole('link',{name:'YouTube에서 보기'})).toHaveAttribute('href','https://youtube.com/watch?v=original');
 expect(screen.getByLabelText('원본 플레이어')).toHaveAttribute('controls');
 expect(screen.getByRole('heading',{level:2})).toHaveTextContent('3');
 expect(screen.getByRole('textbox',{name:'댓글'})).toBeVisible();
});
