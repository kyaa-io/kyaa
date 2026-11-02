import { fireEvent, render, screen } from '@testing-library/react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { SourceSecondaryPanel, SOURCE_SECONDARY_PANELS } from './source-secondary-panel';
const proto=HTMLDialogElement.prototype, originalShow=Object.getOwnPropertyDescriptor(proto,'showModal'), originalClose=Object.getOwnPropertyDescriptor(proto,'close');
beforeAll(()=>{
 Object.defineProperty(proto,'showModal',{configurable:true,value:function(this:HTMLDialogElement){this.open=true;}});
 Object.defineProperty(proto,'close',{configurable:true,value:function(this:HTMLDialogElement){this.open=false;}});
});
afterAll(()=>{
 if(originalShow)Object.defineProperty(proto,'showModal',originalShow);else Reflect.deleteProperty(proto,'showModal');
 if(originalClose)Object.defineProperty(proto,'close',originalClose);else Reflect.deleteProperty(proto,'close');
});
describe('secondary Pencil source-state panels',()=>{
 it.each([
  ['DvkSA','이번에는 당첨되지 않았어요'],['bbw1R','추첨이 취소되었어요'],['TgOcH','응모를 완료했어요'],['PmqiW','응모가 마감되었어요'],['I3IJgL','응모 내역을 먼저 확인해 주세요'],['okmrJ','추첨 결과를 준비하고 있어요'],['A2ESmc','추첨을 만들었어요'],['FesQb','추첨을 만들지 못했어요'],['Z3MtE','한 사람당 1장 응모'],['PRK1L','추첨을 개설할까요?'],['L9zSo','인증 보완 요청'],['VTA0g','참여 완료'],['TZ546','행사에 신청하지 못했어요'],['teuy6','행사 신청을 완료했어요'],['CfkYt','공식 이벤트 신청 접수'],['U2EUX','공식 이벤트 승인'],['qQKqV','지원자료 검토 완료'],['bWeEa','유효하지 않은 티켓이에요'],['WJRCN','공식 이벤트 신청을 검토하고 있어요'],['kgWAV','상품 정보 불러오기 실패'],['g5X3vW','숨긴 컬렉션'],['dhhrY','컬렉션을 저장하지 못했어요'],
 ] as const)('renders %s with the exact source title and an Escape close callback',(nodeId,title)=>{
  const close=vi.fn();render(<SourceSecondaryPanel nodeId={nodeId} onClose={close}/>);const dialog=screen.getByRole('dialog',{name:title});expect(dialog).toHaveAttribute('data-source-node',nodeId);expect(screen.getByRole('heading',{name:title})).toBeInTheDocument();fireEvent(dialog,new Event('cancel',{cancelable:true}));expect(close).toHaveBeenCalledOnce();
 });
 it('keeps the single-ticket receipt action disabled while linking to the existing entry history',()=>{
  render(<SourceSecondaryPanel nodeId='TgOcH' onClose={vi.fn()}/>);
  expect(screen.getByRole('button',{name:'추가 응모 불가'})).toBeDisabled();
  expect(screen.getByRole('link',{name:'내 응모 내역'})).toHaveAttribute('href','/my/raffles?locale=ko');
  expect(screen.getByText('이 추첨은 한 사람당 응모권 1장만 사용할 수 있어요. 추가로 응모할 수 없어요.')).toBeInTheDocument();
 });
 it('retains editable source form values when retrying without sending a creation request',()=>{
  const retry=vi.fn(),request=vi.fn();vi.stubGlobal('fetch',request);render(<SourceSecondaryPanel nodeId='FesQb' onClose={vi.fn()} onRetry={retry}/>);
  const name=screen.getByRole('textbox',{name:'경품 이름'});expect(name).toHaveValue('엔카이브 굿즈');
  expect(screen.getByRole('textbox',{name:'당첨 인원'})).toHaveValue('5명');expect(screen.getByRole('textbox',{name:'응모 마감'})).toHaveValue('2026. 11. 7. 18:00');
  fireEvent.change(name,{target:{value:'로컬 수정 경품'}});fireEvent.click(screen.getByRole('button',{name:'다시 개설'}));expect(retry).toHaveBeenCalledOnce();expect(name).toHaveValue('로컬 수정 경품');expect(request).not.toHaveBeenCalled();
 });
 it('exposes the source single/multiple choices as local radio controls without changing entry rules',()=>{
  const retry=vi.fn(),request=vi.fn();vi.stubGlobal('fetch',request);render(<SourceSecondaryPanel nodeId='Z3MtE' onClose={vi.fn()} onRetry={retry}/>);
  expect(screen.getByRole('radio',{name:'1장만'})).toBeChecked();fireEvent.click(screen.getByRole('radio',{name:'여러 장'}));expect(screen.getByRole('radio',{name:'여러 장'})).toBeChecked();
  expect(screen.getAllByRole('textbox')).toHaveLength(4);fireEvent.click(screen.getByRole('button',{name:'이벤트 만들기'}));expect(retry).toHaveBeenCalledOnce();expect(request).not.toHaveBeenCalled();
 });
 it('renders confirmation details and success details with their own source labels and values',()=>{
  const view=render(<SourceSecondaryPanel nodeId='PRK1L' onClose={vi.fn()}/>);expect(screen.getByText('경품 이름')).toBeInTheDocument();expect(screen.getByText('엔카이브 굿즈')).toBeInTheDocument();expect(screen.getByText('1인 최대 응모권')).toBeInTheDocument();expect(screen.getByText('100장')).toBeInTheDocument();expect(view.container.querySelectorAll('dl>div')).toHaveLength(6);
  view.rerender(<SourceSecondaryPanel nodeId='A2ESmc' onClose={vi.fn()}/>);expect(view.container.querySelectorAll('dl>div')).toHaveLength(2);expect(screen.getByText('1인 최대 장수')).toBeInTheDocument();expect(view.container.querySelector('.sourceSecondaryFeedback .lucide-check')).not.toBeNull();
 });
 it('keeps collection inputs editable, preserves the source placeholders and does not fetch asset URLs',()=>{
  const request=vi.fn(),retry=vi.fn();vi.stubGlobal('fetch',request);const view=render(<SourceSecondaryPanel nodeId='kgWAV' onClose={vi.fn()} onRetry={retry}/>);
  expect(screen.getByPlaceholderText('상품명을 입력하세요')).toHaveAccessibleName('상품명');expect(screen.getByPlaceholderText('이미지 URL을 입력하세요')).toHaveAccessibleName('이미지 URL');
  view.rerender(<SourceSecondaryPanel nodeId='dhhrY' onClose={vi.fn()} onRetry={retry}/>);expect(screen.getByRole('textbox',{name:'상품명'})).toHaveValue('아크릴 키링');expect(screen.getByRole('textbox',{name:'이미지 URL'})).toHaveValue('https://example.com/goods/keyring.png');
  fireEvent.change(screen.getByRole('textbox',{name:'컬렉션 이름'}),{target:{value:'수정한 로컬 컬렉션'}});fireEvent.click(screen.getByRole('button',{name:'다시 저장'}));expect(retry).toHaveBeenCalledOnce();expect(request).not.toHaveBeenCalled();expect(Object.keys(SOURCE_SECONDARY_PANELS)).toHaveLength(22);
 });
});
