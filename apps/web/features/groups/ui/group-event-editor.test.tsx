import {fireEvent,render,screen,waitFor} from '@testing-library/react';
import {expect,it,vi} from 'vitest';
import {GroupEventEditor} from './group-activity-editors';
const request=vi.hoisted(()=>vi.fn());
vi.mock('./use-group-resource',()=>({useGroupRequest:()=>({request})}));
vi.mock('./group-image-field',()=>({GroupImageField:()=>null,imageAssetInput:()=>undefined}));
vi.mock('@/features/content-safety/ui/use-wave-media-upload',()=>({useWaveMediaUpload:()=>({items:[],ready:true,busy:false,add:vi.fn(),remove:vi.fn(),retry:vi.fn(),invalid:false})}));
it('keeps start/end together, preserves failed schedule input and retries the same request identity',async()=>{
 const done=vi.fn();request.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({id:'10000000-0000-4000-8000-000000000001'});
 render(<GroupEventEditor pageId='10000000-0000-4000-8000-000000000001' locale='ko' done={done}/>);
 const start=screen.getByLabelText('시작',{exact:true}),end=screen.getByLabelText('종료',{exact:true});expect(start.closest('label')!.parentElement).toBe(end.closest('label')!.parentElement);
 fireEvent.change(screen.getByLabelText('행사 이름'),{target:{value:'모임 일정'}});fireEvent.change(screen.getByLabelText('설명'),{target:{value:'함께 참여해 주세요.'}});
 for(const [label,value]of [['시작','2026-11-07T19:00'],['종료','2026-11-07T21:00'],['신청 시작','2026-11-01T09:00'],['신청 마감','2026-11-06T18:00'],['장소 또는 링크','서울']])fireEvent.change(screen.getByLabelText(label,{exact:true}),{target:{value}});
 const form=start.closest('form')!;fireEvent.submit(form);await screen.findByRole('alert');expect(screen.getByLabelText('설명')).toHaveValue('함께 참여해 주세요.');expect(done).not.toHaveBeenCalled();fireEvent.submit(form);await waitFor(()=>expect(done).toHaveBeenCalledOnce());const first=JSON.parse(request.mock.calls[0][1].body),second=JSON.parse(request.mock.calls[1][1].body);expect(first).toMatchObject({title:'모임 일정',description:'함께 참여해 주세요.',location:'서울',state:'published'});expect(first.requestId).toBe(second.requestId);expect(Date.parse(first.endsAt)).toBeGreaterThan(Date.parse(first.startsAt));expect(first.startsAt).toBe('2026-11-07T10:00:00.000Z');
});

it('acknowledges the actual nested event-save receipt and renders KST values independent of browser timezone',async()=>{
 const event={id:'10000000-0000-4000-8000-000000000001',title:'실제 행사',description:'참여 안내',imageUrl:null,startsAt:'2026-11-07T10:00:00Z',endsAt:'2026-11-07T12:00:00Z',opensAt:'2026-11-01T00:00:00Z',closesAt:'2026-11-06T09:00:00Z',location:'서울',capacity:null,requiresApproval:false,state:'draft' as const,revision:1,official:false,entryStatus:'none' as const,ticketAvailable:false};
 request.mockReset();request.mockResolvedValue({event});const done=vi.fn();render(<GroupEventEditor pageId={event.id} locale='ko' initial={event} done={done}/>);expect(screen.getByLabelText('시작')).toHaveValue('2026-11-07T19:00');expect(screen.getByText('Asia/Seoul')).toBeInTheDocument();fireEvent.submit(screen.getByLabelText('행사 이름').closest('form')!);await waitFor(()=>expect(done).toHaveBeenCalledOnce());expect(screen.queryByRole('alert')).toBeNull();
});
