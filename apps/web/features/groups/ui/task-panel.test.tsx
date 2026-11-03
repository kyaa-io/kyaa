import {useState} from 'react';
import {render,screen,fireEvent,within} from '@testing-library/react';
import {beforeAll,expect,it,vi} from 'vitest';
import {TaskPanel,TaskActions} from './task-panel';
import {SourceDiscardDialog,SourceConfirmDialog,sourceDiscardConfirmation} from './source-confirm-dialog';
import {APP_LOCALES} from '@/i18n/locales';

beforeAll(()=>{
 Object.defineProperty(HTMLDialogElement.prototype,'showModal',{configurable:true,value:function(this:HTMLDialogElement){this.open=true;}});
 Object.defineProperty(HTMLDialogElement.prototype,'close',{configurable:true,value:function(this:HTMLDialogElement){this.open=false;}});
});
function Editor(){
 const [open,setOpen]=useState(false),[confirm,setConfirm]=useState(false);
 return <><button onClick={()=>setOpen(true)}>Open editor</button>{open&&<TaskPanel title='Editor' onClose={()=>setConfirm(true)} confirmation={confirm?sourceDiscardConfirmation({locale:'en',onContinue:()=>setConfirm(false),onDiscard:()=>setOpen(false)}):undefined} actions={<TaskActions><button onClick={()=>setConfirm(true)}>Cancel edit</button><button>Save edit</button></TaskActions>}><label>Draft<textarea defaultValue='original'/></label><input aria-label='File' type='file'/></TaskPanel>}</>;
}
it('keeps one dialog and mounted uncontrolled fields; restores focus and scroll lock through confirmation',()=>{
 document.body.style.overflow='auto';render(<Editor/>);const trigger=screen.getByRole('button',{name:'Open editor'});trigger.focus();fireEvent.click(trigger);
 const dialog=screen.getByRole('dialog'),draft=screen.getByRole('textbox'),file=screen.getByLabelText('File'),cancel=screen.getByRole('button',{name:'Cancel edit'});
 fireEvent.change(draft,{target:{value:'unsaved original'}});const photo=new File(['photo'],'draft.png',{type:'image/png'});fireEvent.change(file,{target:{files:[photo]}});
 cancel.focus();fireEvent.click(cancel);
 expect(screen.getAllByRole('dialog')).toEqual([dialog]);expect(document.querySelectorAll('dialog[open]')).toHaveLength(1);expect(draft).not.toBeVisible();expect(file).not.toBeVisible();expect(document.body.style.overflow).toBe('hidden');
 expect(screen.getByRole('heading',{name:'Stop writing?'})).toHaveFocus();
 const close=within(dialog).getAllByRole('button',{name:'Keep writing'})[0],discard=screen.getByRole('button',{name:'Discard draft'});
 close.focus();fireEvent.keyDown(close,{key:'Tab',shiftKey:true});expect(discard).toHaveFocus();fireEvent.keyDown(discard,{key:'Tab'});expect(close).toHaveFocus();
 fireEvent(dialog,new Event('cancel',{cancelable:true}));expect(cancel).toHaveFocus();expect(draft).toHaveValue('unsaved original');expect((file as HTMLInputElement).files?.[0]).toBe(photo);expect(draft).toBeVisible();
 draft.focus();fireEvent(dialog,new Event('cancel',{cancelable:true}));fireEvent.click(screen.getAllByRole('button',{name:'Keep writing'}).at(-1)!);expect(draft).toHaveFocus();
 fireEvent.click(cancel);fireEvent.click(screen.getByRole('button',{name:'Discard draft'}));expect(screen.queryByRole('dialog')).toBeNull();expect(trigger).toHaveFocus();expect(document.body.style.overflow).toBe('auto');document.body.style.overflow='';
});
it.each(APP_LOCALES)('keeps the standalone discard dialog and shared copy working in %s',locale=>{
 const keep=vi.fn(),discard=vi.fn(),props={locale,onContinue:keep,onDiscard:discard};render(<SourceDiscardDialog {...props}/>);
 const c=sourceDiscardConfirmation(props),dialog=screen.getByRole('dialog',{name:c.title});expect(document.querySelectorAll('dialog[open]')).toHaveLength(1);expect(dialog).toHaveAttribute('data-source-node','BCMPW');
 fireEvent(dialog,new Event('cancel',{cancelable:true}));expect(keep).toHaveBeenCalledOnce();fireEvent.click(within(dialog).getAllByRole('button').at(-1)!);expect(discard).toHaveBeenCalledOnce();
});
it('owns repeated keyboard Escape before native non-cancelable close requests',()=>{
 const close=vi.fn();render(<TaskPanel title='Task' onClose={close}><input aria-label='Input'/></TaskPanel>);const dialog=screen.getByRole('dialog');
 for(let attempt=0;attempt<3;attempt++)expect(fireEvent.keyDown(dialog,{key:'Escape',cancelable:true})).toBe(false);
 expect(close).toHaveBeenCalledTimes(3);expect(dialog).toHaveAttribute('open');
});
it('keeps generic confirmation pending/disabled actions and header/Escape guards',()=>{
 const close=vi.fn(),confirm=vi.fn();const props={title:'Confirm',cancelLabel:'Cancel',confirmLabel:'Confirm action',closeLabel:'Close',onClose:close,onConfirm:confirm};
 const view=render(<SourceConfirmDialog {...props} pending/>);const dialog=screen.getByRole('dialog');
 fireEvent.click(screen.getByRole('button',{name:'Close'}));fireEvent(dialog,new Event('cancel',{cancelable:true}));expect(close).not.toHaveBeenCalled();expect(screen.getByRole('button',{name:'Cancel'})).toBeDisabled();expect(screen.getByRole('button',{name:'Confirm action'})).toBeDisabled();expect(confirm).not.toHaveBeenCalled();
 view.rerender(<SourceConfirmDialog {...props} confirmDisabled/>);expect(screen.getByRole('button',{name:'Confirm action'})).toBeDisabled();fireEvent.click(screen.getByRole('button',{name:'Cancel'}));expect(close).toHaveBeenCalledOnce();
});
