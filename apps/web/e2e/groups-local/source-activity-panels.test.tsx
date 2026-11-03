import { fireEvent, render, screen } from '@testing-library/react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { SourceActivityPanels, SOURCE_ACTIVITY_PANELS } from './source-activity-panels';
const proto=HTMLDialogElement.prototype, originalShow=Object.getOwnPropertyDescriptor(proto,'showModal'), originalClose=Object.getOwnPropertyDescriptor(proto,'close');
beforeAll(()=>{
 Object.defineProperty(proto,'showModal',{configurable:true,value:function(this:HTMLDialogElement){this.open=true;}});
 Object.defineProperty(proto,'close',{configurable:true,value:function(this:HTMLDialogElement){this.open=false;}});
});
afterAll(()=>{
 if(originalShow)Object.defineProperty(proto,'showModal',originalShow);else Reflect.deleteProperty(proto,'showModal');
 if(originalClose)Object.defineProperty(proto,'close',originalClose);else Reflect.deleteProperty(proto,'close');
});
describe('activity source-state panels',()=>{
 it.each(Object.keys(SOURCE_ACTIVITY_PANELS) as (keyof typeof SOURCE_ACTIVITY_PANELS)[])('renders source %s as an accessible Escape-dismissible dialog',nodeId=>{
  const close=vi.fn();render(<SourceActivityPanels nodeId={nodeId} onClose={close}/>);const title=SOURCE_ACTIVITY_PANELS[nodeId].title;
  const dialog=screen.getByRole('dialog',{name:title});expect(dialog).toHaveAttribute('data-source-node',nodeId);expect(screen.getByRole('heading',{name:title})).toBeInTheDocument();
  fireEvent(dialog,new Event('cancel',{cancelable:true}));expect(close).toHaveBeenCalledOnce();
 });
 it('uses the actual closed/open source art with ten distinct blank results and no draw request',()=>{
  const request=vi.fn(),retry=vi.fn();vi.stubGlobal('fetch',request);const view=render(<SourceActivityPanels nodeId='X4Esx' onClose={vi.fn()} onRetry={retry}/>);
  let art=view.container.querySelector('img')!;expect(art).toHaveAttribute('src','/images/groups/capsule-closed.png');expect(art).toHaveAttribute('width','280');
  view.rerender(<SourceActivityPanels nodeId='hh3j5' onClose={vi.fn()} onRetry={retry}/>);expect(screen.getByRole('heading',{name:'캡슐 10개의 결과'})).toBeInTheDocument();expect(screen.getAllByText('꽝')).toHaveLength(10);expect(view.container.querySelectorAll('img')).toHaveLength(10);
  view.rerender(<SourceActivityPanels nodeId='y1OksT' onClose={vi.fn()} onRetry={retry}/>);art=view.container.querySelector('img')!;expect(art).toHaveAttribute('width','200');expect(screen.getByText('1회차 · 꽝')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'뽑기 기록 보기'}));expect(retry).toHaveBeenCalledOnce();expect(request).not.toHaveBeenCalled();
 });
 it('reuses exported source QR geometry instead of producing an issued ticket or network image',()=>{
  const request=vi.fn();vi.stubGlobal('fetch',request);const view=render(<SourceActivityPanels nodeId='b97Jl' onClose={vi.fn()}/>);
  const qr=screen.getByRole('img',{name:'내 QR 티켓'});expect(qr.tagName.toLowerCase()).toBe('svg');expect(qr).toHaveAttribute('viewBox','0 0 94.48835754394531 94.48820495605469');expect(qr.querySelector('path')?.getAttribute('d')?.length).toBeGreaterThan(1000);
  expect(screen.getByText('한강 러닝 크루 정기 모임')).toBeInTheDocument();expect(screen.getByText('하늘 · 참여 확정')).toBeInTheDocument();expect(view.container.querySelector('.sourceActivityQrCard')?.contains(screen.getByText('하늘 · 참여 확정'))).toBe(false);expect(request).not.toHaveBeenCalled();
 });
 it('retains the source draft through a retry and keeps the readonly room composer readonly',()=>{
  const retry=vi.fn(),request=vi.fn();vi.stubGlobal('fetch',request);const view=render(<SourceActivityPanels nodeId='CnV0Q' onClose={vi.fn()} onRetry={retry}/>);
  const draft=screen.getByRole('textbox',{name:'메시지'});expect(draft.tagName).toBe('TEXTAREA');expect(draft).toHaveValue('내일 무대도 기대할게요!');fireEvent.change(draft,{target:{value:'그대로 남길 로컬 메시지'}});fireEvent.click(screen.getByRole('button',{name:'다시 보내기'}));expect(draft).toHaveValue('그대로 남길 로컬 메시지');expect(retry).toHaveBeenCalledOnce();
  view.rerender(<SourceActivityPanels nodeId='aWY6S' onClose={vi.fn()}/>);expect(screen.getByRole('textbox',{name:'읽기 전용'})).toHaveAttribute('readonly');expect(screen.getByRole('textbox',{name:'읽기 전용'})).toHaveValue('읽기 전용 비밀방');expect(request).not.toHaveBeenCalled();
 });
 it('exposes editable room fields, source Gold select and local checkbox without opening a room',()=>{
  const retry=vi.fn(),request=vi.fn();vi.stubGlobal('fetch',request);render(<SourceActivityPanels nodeId='o7XPns' onClose={vi.fn()} onRetry={retry}/>);
  expect(screen.getByRole('textbox',{name:'방 이름'})).toHaveValue('아티스트와 함께');expect(screen.getByRole('combobox',{name:/최소 팬등급/})).toHaveValue('Gold');
  const check=screen.getByRole('checkbox',{name:'읽기 전용'});expect(check).not.toBeChecked();fireEvent.click(check);expect(check).toBeChecked();fireEvent.click(screen.getByRole('button',{name:'비밀방 열기'}));expect(retry).toHaveBeenCalledOnce();expect(request).not.toHaveBeenCalled();
 });
 it('keeps source collection validation visible and connected to the missing product-name field',()=>{
  const retry=vi.fn();const view=render(<SourceActivityPanels nodeId='omRRR' onClose={vi.fn()} onRetry={retry}/>);
  const name=screen.getByRole('textbox',{name:'상품명'});expect(name).toHaveAttribute('aria-invalid','true');expect(name).toHaveAccessibleDescription('상품명을 입력해 주세요.');expect(name).toHaveAttribute('placeholder','상품명을 입력하세요');expect(screen.getByRole('textbox',{name:'컬렉션 이름'})).toHaveValue('함께 간직하는 물건');
  expect(screen.getByRole('button',{name:'저장'})).toBeDisabled();fireEvent.change(name,{target:{value:'직접 입력한 상품'}});expect(screen.getByRole('button',{name:'저장'})).toBeEnabled();fireEvent.click(screen.getByRole('button',{name:'저장'}));expect(name).toHaveValue('직접 입력한 상품');expect(retry).toHaveBeenCalledOnce();
  view.rerender(<SourceActivityPanels nodeId='FOZsA' onClose={vi.fn()}/>);fireEvent.click(screen.getByRole('checkbox',{name:'컬렉션 숨기기'}));expect(screen.getByRole('checkbox',{name:'컬렉션 숨기기'})).toBeChecked();expect(Object.keys(SOURCE_ACTIVITY_PANELS)).toHaveLength(36);
 });
 it('keeps entry-limit warnings and requirement action icons distinct from confirmation',()=>{
  const view=render(<SourceActivityPanels nodeId='KzjUJ' onClose={vi.fn()}/>);expect(screen.getByText('이미 응모한 수량')).toBeInTheDocument();expect(screen.getByText('30장')).toBeInTheDocument();expect(screen.queryByRole('button',{name:'응모할 수 없음'})).not.toBeInTheDocument();expect(screen.getByRole('button',{name:'수량 수정'})).toBeEnabled();
  view.rerender(<SourceActivityPanels nodeId='DFN1c' onClose={vi.fn()}/>);expect(screen.getByText('팬 인증 완료')).toBeInTheDocument();expect(screen.getByText('Gold 이상')).toBeInTheDocument();expect(screen.getByRole('link',{name:'팬 인증하기'}).querySelector('.lucide-badge-check')).not.toBeNull();expect(screen.getByRole('link',{name:'내 팬등급 보기'}).querySelector('.lucide-medal')).not.toBeNull();
 });
});
