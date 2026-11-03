import {render,screen,fireEvent,waitFor,cleanup} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {GroupBookmarkAction} from './group-bookmark-action';
import type {GroupDetail} from '../domain/contracts';
const auth=vi.hoisted(()=>({request:vi.fn(),authenticated:true,ready:true}));
vi.mock('./use-group-resource',()=>({useGroupRequest:()=>auth}));
const detail={page:{id:'10000000-0000-4000-8000-000000000001'},bookmarked:false,membership:null} as GroupDetail;
afterEach(cleanup);beforeEach(()=>{auth.request.mockReset().mockResolvedValue({});auth.authenticated=true;auth.ready=true;});
it('uses the group bookmark endpoint and refreshes only after success',async()=>{
 const refresh=vi.fn();render(<GroupBookmarkAction detail={detail} locale='en' refresh={refresh} iconOnly/>);
 fireEvent.click(screen.getByRole('button',{name:'Bookmark'}));await waitFor(()=>expect(refresh).toHaveBeenCalledOnce());
 expect(auth.request).toHaveBeenCalledWith('/api/groups/'+detail.page.id+'/bookmark',{method:'PUT',body:expect.any(String)});
 expect(JSON.parse(auth.request.mock.calls[0][1].body).requestId).toMatch(/^[a-f\d-]{36}$/);
});
it('preserves selected state and exposes a retryable error when removal fails',async()=>{
 auth.request.mockRejectedValueOnce(new Error('offline'));const refresh=vi.fn();render(<GroupBookmarkAction detail={{...detail,bookmarked:true}} locale='en' refresh={refresh}/>);
 const button=screen.getByRole('button',{name:'Remove bookmark'});fireEvent.click(button);await screen.findByRole('alert');expect(button).toHaveAttribute('aria-pressed','true');expect(refresh).not.toHaveBeenCalled();expect(auth.request.mock.calls[0][1].method).toBe('DELETE');
 fireEvent.click(button);await waitFor(()=>expect(refresh).toHaveBeenCalledOnce());expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});
it('does not send a bookmark write without authentication',()=>{
 auth.authenticated=false;render(<GroupBookmarkAction detail={detail} locale='en' refresh={()=>{}}/>);const button=screen.getByRole('button',{name:'Bookmark'});expect(button).toBeDisabled();fireEvent.click(button);expect(auth.request).not.toHaveBeenCalled();
});
