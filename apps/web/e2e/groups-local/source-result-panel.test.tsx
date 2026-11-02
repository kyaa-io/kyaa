import { fireEvent, render, screen } from '@testing-library/react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { SourceResultPanel, SOURCE_RESULT_PANELS } from './source-result-panel';
const proto=HTMLDialogElement.prototype, originalShow=Object.getOwnPropertyDescriptor(proto,'showModal'), originalClose=Object.getOwnPropertyDescriptor(proto,'close');
beforeAll(()=>{
 Object.defineProperty(proto,'showModal',{configurable:true,value:function(this:HTMLDialogElement){this.open=true;}});
 Object.defineProperty(proto,'close',{configurable:true,value:function(this:HTMLDialogElement){this.open=false;}});
});
afterAll(()=>{
 if(originalShow)Object.defineProperty(proto,'showModal',originalShow);else Reflect.deleteProperty(proto,'showModal');
 if(originalClose)Object.defineProperty(proto,'close',originalClose);else Reflect.deleteProperty(proto,'close');
});
describe('Pencil local result-panel source examples',()=>{
 it.each([
  ['QnIgR','잔액을 불러오지 못했어요'],['QnKkN','교환을 완료하지 못했어요'],['cPjvM','교환을 확인하고 있어요'],['iboGb','지급 내역을 확인할 수 없어요'],['NcJxO','출석을 확인하고 있어요'],['es3y5','이전 뽑기 결과가 있어요'],['We1zf','뽑기 결과를 확인할 수 없어요'],['onxeg','방송 예정'],['KdGqe','방송 종료'],['OWIeU','방송 종료'],['i0KaKL','재추첨 결과 준비 중'],['cRVyO','모션 감소가 켜져 있어요'],
 ] as const)('renders exact source title %s in a named, Escape-dismissible dialog',(nodeId,title)=>{
  const onClose=vi.fn();render(<SourceResultPanel nodeId={nodeId} onClose={onClose}/>);
  const dialog=screen.getByRole('dialog',{name:title});expect(dialog).toHaveAttribute('data-source-node',nodeId);expect(screen.getByRole('heading',{name:title})).toBeInTheDocument();
  expect(dialog).toHaveAttribute('aria-describedby',`${nodeId}-body`);
  fireEvent(dialog,new Event('cancel',{cancelable:true}));expect(onClose).toHaveBeenCalledOnce();
 });
 it('keeps the exchange error tile, source action order, retry and history destination distinct',()=>{
  const retry=vi.fn(),close=vi.fn(),request=vi.fn();vi.stubGlobal('fetch',request);
  const view=render(<SourceResultPanel nodeId='QnKkN' onClose={close} onRetry={retry}/>);
  expect(view.container.querySelector('.sourceResultFeedback[data-kind="danger"] .lucide-circle-alert')).not.toBeNull();
  expect(screen.getByText('기존 잔액은 그대로예요. 다시 시도해 주세요.')).toBeInTheDocument();
  const actions=view.container.querySelector('.sourceResultActions')!;
  expect(actions.children[0]).toHaveTextContent('교환 내역 확인');expect(actions.children[1]).toHaveTextContent('다시 시도');
  expect(screen.getByRole('link',{name:'교환 내역 확인'})).toHaveAttribute('href','/my/wallet?locale=ko');
  fireEvent.click(screen.getByRole('button',{name:'다시 시도'}));expect(retry).toHaveBeenCalledOnce();expect(close).not.toHaveBeenCalled();expect(request).not.toHaveBeenCalled();
 });
 it('retains source progress treatments and never makes a pending button submit an operation',()=>{
  const retry=vi.fn(),close=vi.fn();const view=render(<SourceResultPanel nodeId='cPjvM' onClose={close} onRetry={retry}/>);
  expect(screen.queryByRole('button',{name:'교환 확인 중…'})).not.toBeInTheDocument();
  expect(view.container.querySelector('.sourceResultHeading .lucide-clock-3')).not.toBeNull();
  fireEvent.click(screen.getByRole('button',{name:'결과 확인'}));expect(retry).toHaveBeenCalledOnce();
  view.rerender(<SourceResultPanel nodeId='NcJxO' onClose={close} onRetry={retry}/>);
  expect(screen.queryByRole('button',{name:'출석 처리 중'})).not.toBeInTheDocument();expect(retry).toHaveBeenCalledOnce();
 });
 it('shows the reduced-motion source artwork at 160px without drawing or changing browser motion preferences',()=>{
  const retry=vi.fn(),request=vi.fn();vi.stubGlobal('fetch',request);
  const view=render(<SourceResultPanel nodeId='cRVyO' onClose={vi.fn()} onRetry={retry}/>);
  const dialog=screen.getByRole('dialog');expect(dialog).toHaveAttribute('data-capsule','true');
  const image=view.container.querySelector('img')!;expect(image).toHaveAttribute('src','/images/groups/capsule-closed.png');expect(image).toHaveAttribute('width','160');expect(image).toHaveAttribute('height','160');
  expect(screen.getByText('캡슐 연출을 줄이고 같은 뽑기 결과를 확인할 수 있어요.')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'결과 바로 보기'}));expect(retry).toHaveBeenCalledOnce();expect(request).not.toHaveBeenCalled();
 });
 it('preserves replay availability and the exact source schedule as separate LIVE panels',()=>{
  const props={onClose:vi.fn()};const view=render(<SourceResultPanel nodeId='onxeg' {...props}/>);
  expect(screen.getByText('11월 1일 오후 8시 (KST)')).toBeInTheDocument();expect(screen.getByRole('link',{name:'팬페이지 홈'})).toHaveAttribute('href','/nchive?locale=ko');
  view.rerender(<SourceResultPanel nodeId='KdGqe' {...props}/>);expect(screen.getByText('다시보기가 제공됩니다.')).toBeInTheDocument();expect(screen.getByRole('link',{name:'다시보기'})).toHaveAttribute('href','/nchive?view=video&locale=ko');expect(view.container.querySelector('.sourceResultFeedback .lucide-inbox')).not.toBeNull();
  view.rerender(<SourceResultPanel nodeId='OWIeU' {...props}/>);expect(screen.getByText('다시보기가 제공되지 않습니다.')).toBeInTheDocument();expect(screen.queryByRole('link',{name:'다시보기'})).not.toBeInTheDocument();
 });
 it('keeps prior capsule results and rerun text as previews without another paid mutation',()=>{
  const retry=vi.fn(),request=vi.fn();vi.stubGlobal('fetch',request);const view=render(<SourceResultPanel nodeId='es3y5' onClose={vi.fn()} onRetry={retry}/>);
  expect(screen.getByRole('dialog')).toHaveAttribute('data-plain','true');expect(screen.getByText(/결과나 연출을 다시 봐도 응모권은 추가로 차감되지 않아요/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'연출 다시 보기'}));fireEvent.click(screen.getByRole('button',{name:'이전 결과 보기'}));expect(retry).toHaveBeenCalledTimes(2);
  view.rerender(<SourceResultPanel nodeId='i0KaKL' onClose={vi.fn()}/>);expect(screen.getByText('기존 당첨자와 수령 기한을 넘긴 회원을 제외하고 자동으로 다시 추첨하고 있어요.')).toBeInTheDocument();expect(screen.getByText('응모권은 추가로 차감되지 않아요.')).toBeInTheDocument();expect(request).not.toHaveBeenCalled();expect(Object.keys(SOURCE_RESULT_PANELS)).toHaveLength(14);
 });
});
