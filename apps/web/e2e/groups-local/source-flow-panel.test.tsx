import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import {SOURCE_FLOW_PANELS,SourceFlowPanel,type SourceFlowNodeId} from './source-flow-panel';
afterEach(cleanup);
it.each(Object.keys(SOURCE_FLOW_PANELS) as SourceFlowNodeId[])('renders the actual source state %s',nodeId=>{
 const {container}=render(<SourceFlowPanel nodeId={nodeId} onClose={()=>{}}/>);
 expect(screen.getByRole('heading',{name:SOURCE_FLOW_PANELS[nodeId].title})).toBeInTheDocument();
 expect(container.querySelector('[data-source-flow]')).toHaveAttribute('data-source-flow',nodeId);
 expect(container.querySelector('[data-source-icon]')).toHaveAttribute('data-source-icon',SOURCE_FLOW_PANELS[nodeId].icon);
});
it.each([['HtWDL','페이지 이름','다시 신청하기'],['LAbTd','함께 달리고 싶은 코스가 있나요?','다시 가입하기'],['DeQ3f','작성 중인 메시지','다시 보내기']] as const)('retains edited fields through a local retry in %s', (nodeId,label,button)=>{
 const retry=vi.fn(),fetch=vi.spyOn(globalThis,'fetch');
 const view=render(<SourceFlowPanel nodeId={nodeId} onClose={()=>{}} onRetry={retry}/>);
 fireEvent.change(screen.getByLabelText(label),{target:{value:'사용자가 수정한 내용'}});
 fireEvent.click(screen.getByRole('button',{name:button}));
 view.rerender(<SourceFlowPanel nodeId={nodeId} onClose={()=>{}} onRetry={retry}/>);
 expect(screen.getByLabelText(label)).toHaveValue('사용자가 수정한 내용');
 expect(retry).toHaveBeenCalledOnce();expect(fetch).not.toHaveBeenCalled();fetch.mockRestore();
});
it.each([['XbwIn','신청 전송 중'],['rQ0kj','가입하는 중…']] as const)('keeps the processing action disabled in %s',(nodeId,label)=>{
 const close=vi.fn(),retry=vi.fn();render(<SourceFlowPanel nodeId={nodeId} onClose={close} onRetry={retry}/>);
 const button=screen.getByRole('button',{name:label});expect(button).toBeDisabled();fireEvent.click(button);expect(close).not.toHaveBeenCalled();expect(retry).not.toHaveBeenCalled();
});
it('closes with the source cancel action or Escape and keeps the audit link real',()=>{
 const close=vi.fn();const view=render(<SourceFlowPanel nodeId='HtWDL' onClose={close}/>);
 fireEvent.click(screen.getByRole('button',{name:'취소'}));expect(close).toHaveBeenCalledOnce();
 fireEvent.keyDown(screen.getByRole('heading'),{key:'Escape'});expect(close).toHaveBeenCalledTimes(2);
 view.rerender(<SourceFlowPanel nodeId='Hz8Q0' onClose={close}/>);
 expect(screen.getByRole('link',{name:'처리 기록 확인'})).toHaveAttribute('href','/admin/audit');
});
it('does not fabricate a state for an unknown source ID',()=>{
 const {container}=render(<SourceFlowPanel nodeId='unknown' onClose={()=>{}}/>);expect(container).toBeEmptyDOMElement();
});
it('keeps the failed post draft and locally removes only its attachment',()=>{
 const retry=vi.fn(),fetch=vi.spyOn(globalThis,'fetch');
 render(<SourceFlowPanel nodeId='MY9YB' onClose={()=>{}} onRetry={retry}/>);
 fireEvent.change(screen.getByLabelText('제목 · 필수'),{target:{value:'수정한 제목'}});
 fireEvent.change(screen.getByLabelText('내용'),{target:{value:'수정한 내용'}});
 fireEvent.click(screen.getByRole('button',{name:'삭제'}));
 expect(screen.queryByText('응원 사진 1장')).toBeNull();
 expect(screen.getByLabelText('제목 · 필수')).toHaveValue('수정한 제목');
 expect(screen.getByLabelText('내용')).toHaveValue('수정한 내용');
 fireEvent.click(screen.getByRole('button',{name:'다시 등록'}));
 expect(retry).toHaveBeenCalledOnce();expect(fetch).not.toHaveBeenCalled();fetch.mockRestore();
});
