import { fireEvent, render, screen } from '@testing-library/react';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { SourceWalletState } from './source-wallet-state';
const proto=HTMLDialogElement.prototype, originalShow=Object.getOwnPropertyDescriptor(proto,'showModal'), originalClose=Object.getOwnPropertyDescriptor(proto,'close');
beforeAll(()=>{
 Object.defineProperty(proto,'showModal',{configurable:true,value:function(this:HTMLDialogElement){this.open=true;}});
 Object.defineProperty(proto,'close',{configurable:true,value:function(this:HTMLDialogElement){this.open=false;}});
});
afterAll(()=>{
 if(originalShow)Object.defineProperty(proto,'showModal',originalShow);else Reflect.deleteProperty(proto,'showModal');
 if(originalClose)Object.defineProperty(proto,'close',originalClose);else Reflect.deleteProperty(proto,'close');
});
it.each([['fMkHm','광고 교환을 완료했어요','교환 결과는 적립·사용 내역에서 확인할 수 있어요.','내역 보기'],['Vgw4h','교환이 취소되었어요','광고 시청이 완료되지 않아 교환되지 않았어요.','다시 시도']] as const)('shows source %s and closes without running any financial operation',(nodeId,title,description,action)=>{
 const request=vi.fn(),onClose=vi.fn();vi.stubGlobal('fetch',request);
 const view=render(<SourceWalletState nodeId={nodeId} onClose={onClose}/>);
 expect(screen.getByRole('dialog',{name:title})).toHaveAttribute('data-source-node',nodeId);
 expect(screen.getByText(description)).toBeInTheDocument();
 expect(view.container.querySelectorAll('.sourceWalletStateFeedback')).toHaveLength(nodeId==='fMkHm'?1:0);
 fireEvent.click(screen.getByRole('button',{name:action}));expect(onClose).toHaveBeenCalledOnce();expect(request).not.toHaveBeenCalled();
 fireEvent(screen.getByRole('dialog'),new Event('cancel',{bubbles:false,cancelable:true}));expect(onClose).toHaveBeenCalledTimes(2);
});
