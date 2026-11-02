import {fireEvent,render,screen,waitFor} from '@testing-library/react';
import {expect,it,vi} from 'vitest';
import {GroupMissionEditor} from './group-activity-editors';
const request=vi.hoisted(()=>vi.fn());
vi.mock('./use-group-resource',()=>({useGroupRequest:()=>({request})}));
vi.mock('./group-image-field',()=>({GroupImageField:()=>null,imageAssetInput:()=>undefined}));
it('acknowledges the real nested mission receipt and preserves the retry identity after an invalid response',async()=>{
 const id='10000000-0000-4000-8000-000000000001',done=vi.fn();
 request.mockResolvedValueOnce({mission:{id:'invalid'}}).mockResolvedValueOnce({mission:{id,title:'활동 인증',state:'draft'}});
 const {container}=render(<GroupMissionEditor pageId={id} locale='ko' done={done}/>);
 const form=container.querySelector('form')!;
 fireEvent.change(form.querySelector('[name="title"]')!,{target:{value:'활동 인증'}});
 fireEvent.change(form.querySelector('[name="instructions"]')!,{target:{value:'참여 내용을 남겨 주세요.'}});
 fireEvent.submit(form);await screen.findByRole('alert');expect(done).not.toHaveBeenCalled();
 fireEvent.submit(form);await waitFor(()=>expect(done).toHaveBeenCalledOnce());expect(screen.queryByRole('alert')).toBeNull();
 const payloads=request.mock.calls.map(([,options])=>JSON.parse(options.body));expect(payloads[0].requestId).toBe(payloads[1].requestId);expect(payloads[1].title).toBe('활동 인증');
});
