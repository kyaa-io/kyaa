import {useState} from 'react';
import {fireEvent,render,screen,waitFor,within} from '@testing-library/react';
import {afterAll,beforeAll,expect,it,vi} from 'vitest';
import {GroupTextTask} from './group-text-task';
const proto=HTMLDialogElement.prototype,show=Object.getOwnPropertyDescriptor(proto,'showModal'),close=Object.getOwnPropertyDescriptor(proto,'close');
beforeAll(()=>{Object.defineProperty(proto,'showModal',{configurable:true,value:function(this:HTMLDialogElement){this.open=true;}});Object.defineProperty(proto,'close',{configurable:true,value:function(this:HTMLDialogElement){this.open=false;}});});
afterAll(()=>{if(show)Object.defineProperty(proto,'showModal',show);else Reflect.deleteProperty(proto,'showModal');if(close)Object.defineProperty(proto,'close',close);else Reflect.deleteProperty(proto,'close');});
it('keeps failed input and cancels discard without creating a second dialog',async()=>{
 const save=vi.fn(async()=>false),closeTask=vi.fn();render(<GroupTextTask locale='ko' title='후기 쓰기' submitLabel='후기 등록' label='후기 내용' maxLength={5000} busy={false} failed onSubmit={save} onClose={closeTask}/>);
 fireEvent.change(screen.getByRole('textbox'),{target:{value:'작성한 후기'}});fireEvent.submit(screen.getByRole('textbox').closest('form')!);await waitFor(()=>expect(save).toHaveBeenCalledWith('작성한 후기'));expect(screen.getByRole('textbox')).toHaveValue('작성한 후기');
 fireEvent.click(within(screen.getByRole('dialog')).getAllByRole('button',{name:'취소'})[0]);expect(screen.getAllByRole('dialog')).toHaveLength(1);expect(screen.getByRole('dialog',{name:'작성 중인 내용을 버릴까요?'})).toBeInTheDocument();fireEvent.click(within(screen.getByRole('dialog')).getAllByRole('button',{name:'취소'}).at(-1)!);expect(screen.getByRole('textbox')).toHaveValue('작성한 후기');expect(closeTask).not.toHaveBeenCalled();
});
it('closes only after the real submit callback reports success and restores focus',async()=>{
 const save=vi.fn(async()=>true);function View(){const [open,setOpen]=useState(false);return <><button onClick={()=>setOpen(true)}>열기</button>{open&&<GroupTextTask locale='en' title='Write review' submitLabel='Post review' label='Body' maxLength={5000} busy={false} failed={false} onSubmit={save} onClose={()=>setOpen(false)}/>}</>;}
 render(<View/>);const trigger=screen.getByRole('button',{name:'열기'});trigger.focus();fireEvent.click(trigger);fireEvent.change(screen.getByRole('textbox'),{target:{value:'A real review'}});fireEvent.submit(screen.getByRole('textbox').closest('form')!);await waitFor(()=>expect(screen.queryByRole('dialog')).toBeNull());expect(save).toHaveBeenCalledWith('A real review');expect(trigger).toHaveFocus();expect(document.body.style.overflow).not.toBe('hidden');
});
