import {fireEvent,render,screen,waitFor} from '@testing-library/react';
import {expect,it,vi} from 'vitest';
import {GroupEventEditor} from './group-activity-editors';
const request=vi.hoisted(()=>vi.fn());
vi.mock('./use-group-resource',()=>({useGroupRequest:()=>({request})}));
vi.mock('./group-image-field',()=>({GroupImageField:()=>null,imageAssetInput:()=>undefined}));
it('keeps start/end together, preserves failed schedule input and retries the same request identity',async()=>{
 const done=vi.fn();request.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({id:'10000000-0000-4000-8000-000000000001'});
 render(<GroupEventEditor pageId='10000000-0000-4000-8000-000000000001' locale='ko' done={done}/>);
 const start=screen.getByLabelText('시작',{exact:true}),end=screen.getByLabelText('종료',{exact:true});expect(start.closest('label')!.parentElement).toBe(end.closest('label')!.parentElement);
 fireEvent.change(screen.getByLabelText('제목'),{target:{value:'모임 일정'}});fireEvent.change(screen.getByLabelText('내용'),{target:{value:'함께 참여해 주세요.'}});
 for(const [label,value]of [['시작','2026-11-07T19:00'],['종료','2026-11-07T21:00'],['신청 시작','2026-11-01T09:00'],['신청 마감','2026-11-06T18:00'],['장소','서울']])fireEvent.change(screen.getByLabelText(label,{exact:true}),{target:{value}});
 const form=start.closest('form')!;fireEvent.submit(form);await screen.findByRole('alert');expect(screen.getByLabelText('내용')).toHaveValue('함께 참여해 주세요.');expect(done).not.toHaveBeenCalled();fireEvent.submit(form);await waitFor(()=>expect(done).toHaveBeenCalledOnce());const first=JSON.parse(request.mock.calls[0][1].body),second=JSON.parse(request.mock.calls[1][1].body);expect(first).toMatchObject({title:'모임 일정',description:'함께 참여해 주세요.',location:'서울',state:'draft'});expect(first.requestId).toBe(second.requestId);expect(Date.parse(first.endsAt)).toBeGreaterThan(Date.parse(first.startsAt));
});
