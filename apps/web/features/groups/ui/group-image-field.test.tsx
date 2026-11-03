import { fireEvent,render,screen } from '@testing-library/react';
import { beforeEach,expect,it,vi } from 'vitest';
import { GroupImageField,imageAssetInput } from './group-image-field';
const state=vi.hoisted(()=>({items:[] as Array<{key:string;file:File;assetId?:string;failed?:boolean}>,ready:true,busy:false,invalid:false,add:vi.fn(),remove:vi.fn(),retry:vi.fn()}));
const hook=vi.hoisted(()=>vi.fn());
vi.mock('@/features/content-safety/ui/use-wave-media-upload',()=>({useWaveMediaUpload:(purpose:string,limit:number)=>{hook(purpose,limit);return state;}}));
vi.mock('./group-post-asset',()=>({GroupPostAsset:()=>null}));
beforeEach(()=>{state.items=[];state.ready=true;state.busy=false;state.invalid=false;hook.mockClear();Object.defineProperty(URL,'createObjectURL',{value:vi.fn(()=> 'blob:preview'),configurable:true});Object.defineProperty(URL,'revokeObjectURL',{value:vi.fn(),configurable:true});});
it('preserves the existing photo when untouched and sends explicit null on removal',()=>{
 const view=render(<form><GroupImageField locale='ko' initialUrl='/existing.png' onReadyChange={()=>{}}/></form>),form=view.container.querySelector('form')!;
 expect(imageAssetInput(new FormData(form))).toBeUndefined();fireEvent.click(screen.getByRole('button',{name:'삭제'}));expect(imageAssetInput(new FormData(form))).toBeNull();expect(hook).toHaveBeenCalledWith('group_image',1);
});
it('keeps saving locked until the actual uploaded image is ready',()=>{
 const id='10000000-0000-4000-8000-000000000001',file=new File(['image'],'photo.png',{type:'image/png'}),ready=vi.fn();state.items=[{key:id,file,assetId:id}];state.busy=true;state.ready=false;
 const view=render(<form><GroupImageField locale='ko' onReadyChange={ready}/></form>);expect(ready).toHaveBeenLastCalledWith(false);state.busy=false;state.ready=true;view.rerender(<form><GroupImageField locale='ko' onReadyChange={ready}/></form>);expect(ready).toHaveBeenLastCalledWith(true);expect(imageAssetInput(new FormData(view.container.querySelector('form')!))).toBe(id);
});
