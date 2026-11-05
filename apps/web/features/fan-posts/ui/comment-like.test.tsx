import {fireEvent,render,screen,waitFor} from '@testing-library/react';
import {beforeEach,expect,it,vi} from 'vitest';
import {CommentLike} from './comment-like';
const state=vi.hoisted(()=>({calls:[] as unknown[][],result:null as unknown}));
vi.mock('@/features/content-safety/ui/use-content-mutation',()=>({useContentMutation:()=>({busy:false,error:'',request:async(...args:unknown[])=>{state.calls.push(args);return state.result;}})}));
beforeEach(()=>{state.calls=[];state.result=null;});
it('saves the heart through the comment reaction API and keeps the server count',async()=>{
 state.result={commentId:'c1',reactions:[{emoji:'❤',count:3,selected:true}]};
 render(<CommentLike commentId='c1' locale='ko' reactions={[{emoji:'❤',count:2,selected:false}]}/>);
 const button=screen.getByRole('button',{name:'좋아요'});
 fireEvent.click(button);
 expect(button).toHaveAttribute('aria-pressed','true');
 await waitFor(()=>expect(button).toHaveTextContent('3'));
 expect(state.calls[0]).toEqual(['/api/post-comments/c1/reaction','PUT',{emoji:'❤'}]);
});
it('removes the heart with a null emoji and reverts when saving fails',async()=>{
 render(<CommentLike commentId='c1' locale='ko' reactions={[{emoji:'❤',count:1,selected:true}]}/>);
 const button=screen.getByRole('button',{name:'좋아요'});
 fireEvent.click(button);
 await waitFor(()=>expect(button).toHaveAttribute('aria-pressed','true'));
 expect(state.calls[0]).toEqual(['/api/post-comments/c1/reaction','PUT',{emoji:null}]);
 expect(button).toHaveTextContent('1');
});
