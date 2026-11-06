import '@testing-library/jest-dom/vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {GroupEventEditor} from './group-activity-editors';
import {manageText} from './manage-copy';
const request=vi.hoisted(()=>vi.fn());
vi.mock('./use-group-resource',()=>({useGroupRequest:()=>({request,ready:false,ownerKey:'o'})}));
vi.mock('@/features/content-safety/ui/use-wave-media-upload',()=>({useWaveMediaUpload:()=>({items:[],ready:true,busy:false,add:vi.fn(),remove:vi.fn(),retry:vi.fn(),invalid:false})}));
const pageId='10000000-0000-4000-8000-000000000001';
const event={id:pageId,title:'실제 행사',description:'안내',imageUrl:null,startsAt:'2026-11-07T10:00:00Z',endsAt:'2026-11-07T12:00:00Z',opensAt:'2026-11-01T00:00:00Z',closesAt:'2026-11-06T09:00:00Z',location:'서울',capacity:10,requiresApproval:true,state:'published' as const,revision:1,official:false,entryStatus:'none' as const,ticketAvailable:false,approvalStatus:'approved' as const,approvalReason:null};
beforeEach(()=>{request.mockReset();request.mockResolvedValue({id:pageId});});
afterEach(()=>cleanup());
const form=()=>document.querySelector('form')!;
const body=()=>JSON.parse(request.mock.calls[0][1].body);
it('creates an event from the name and start alone, within the server rules',async()=>{
 const done=vi.fn();render(<GroupEventEditor pageId={pageId} locale='ko' done={done}/>);
 fireEvent.change(screen.getByLabelText(manageText('ko','eventName')),{target:{value:'11월 정기 모임'}});
 fireEvent.change(screen.getByLabelText('시작'),{target:{value:'2031-01-10T19:00'}});
 expect(screen.getByLabelText('종료')).toHaveValue('2031-01-10T21:00');
 fireEvent.submit(form());await waitFor(()=>expect(done).toHaveBeenCalledOnce());
 const sent=body();
 expect(sent).toMatchObject({title:'11월 정기 모임',state:'published',location:manageText('ko','eventLocationUndecided'),capacity:null,requiresApproval:false});
 expect(sent.startsAt).toBe('2031-01-10T10:00:00.000Z');expect(sent.endsAt).toBe('2031-01-10T12:00:00.000Z');expect(sent.closesAt).toBe(sent.startsAt);
 expect(Date.parse(sent.opensAt)).toBeLessThan(Date.parse(sent.closesAt));
});
it('marks only the name and start as required',()=>{
 render(<GroupEventEditor pageId={pageId} locale='ko'/>);
 expect(Array.from(form().querySelectorAll('[required]')).map(node=>node.getAttribute('name')).sort()).toEqual(['startsAt','title']);
});
it('opens applications before the start even when the start has passed',async()=>{
 const done=vi.fn();render(<GroupEventEditor pageId={pageId} locale='ko' done={done}/>);
 fireEvent.change(screen.getByLabelText(manageText('ko','eventName')),{target:{value:'지난 행사'}});
 fireEvent.change(screen.getByLabelText('시작'),{target:{value:'2020-01-10T19:00'}});
 fireEvent.submit(form());await waitFor(()=>expect(done).toHaveBeenCalledOnce());
 expect(Date.parse(body().opensAt)).toBeLessThan(Date.parse(body().closesAt));
});
it('stops an end before the start and sends nothing',async()=>{
 render(<GroupEventEditor pageId={pageId} locale='ko'/>);
 fireEvent.change(screen.getByLabelText(manageText('ko','eventName')),{target:{value:'행사'}});
 fireEvent.change(screen.getByLabelText('시작'),{target:{value:'2031-01-10T19:00'}});
 fireEvent.change(screen.getByLabelText('종료'),{target:{value:'2031-01-10T18:00'}});
 fireEvent.submit(form());
 expect(await screen.findByRole('alert')).toHaveTextContent(manageText('ko','eventInvalidDates'));
 expect(request).not.toHaveBeenCalled();
});
it('keeps the stored dates and shows the renewal line only for fields that need approval again',async()=>{
 render(<GroupEventEditor pageId={pageId} locale='ko' initial={event}/>);
 expect(screen.getByLabelText('시작')).toHaveValue('2026-11-07T19:00');
 const line=manageText('ko','eventReapproval');
 expect(screen.queryByText(line)).toBeNull();
 fireEvent.change(screen.getByLabelText(manageText('ko','eventDescription')),{target:{value:'바뀐 안내'}});
 expect(screen.queryByText(line)).toBeNull();
 fireEvent.change(screen.getByLabelText('정원'),{target:{value:'5'}});
 expect(screen.queryByText(line)).toBeNull();
 fireEvent.change(screen.getByLabelText('정원'),{target:{value:'20'}});
 expect(screen.getByText(line)).toBeInTheDocument();
 fireEvent.change(screen.getByLabelText('정원'),{target:{value:'10'}});
 expect(screen.queryByText(line)).toBeNull();
 fireEvent.change(screen.getByLabelText(manageText('ko','eventName')),{target:{value:'이름 변경'}});
 expect(screen.getByText(line)).toBeInTheDocument();
});
it('does not warn while the event has not been approved',()=>{
 render(<GroupEventEditor pageId={pageId} locale='ko' initial={{...event,approvalStatus:'pending'}}/>);
 fireEvent.change(screen.getByLabelText(manageText('ko','eventName')),{target:{value:'이름 변경'}});
 expect(screen.queryByText(manageText('ko','eventReapproval'))).toBeNull();
});
