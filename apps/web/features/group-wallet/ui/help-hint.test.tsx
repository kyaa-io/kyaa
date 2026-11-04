import {fireEvent,render,screen} from '@testing-library/react';
import {describe,expect,it} from 'vitest';
import {HelpHint} from './help-hint';
import {walletHelpCopy} from './copy';
import {APP_LOCALES} from '@/i18n/locales';

describe('HelpHint',()=>{
 it('click으로 고정하고 바깥 누름·Esc로 닫으며 Esc는 포커스를 트리거로 돌려준다',()=>{
  render(<><HelpHint label='도움말' text='설명'/><button>다른</button></>);
  const t=screen.getByRole('button',{name:'도움말'});
  expect(t).toHaveAttribute('aria-expanded','false');
  fireEvent.click(t);
  expect(t).toHaveAttribute('aria-expanded','true');
  const tip=screen.getByRole('tooltip');
  expect(tip).toHaveTextContent('설명');
  expect(t.getAttribute('aria-controls')).toBe(tip.id);
  expect(t.getAttribute('aria-describedby')).toBe(tip.id);
  fireEvent.pointerDown(screen.getByRole('button',{name:'다른'}));
  expect(t).toHaveAttribute('aria-expanded','false');
  fireEvent.click(t);
  screen.getByRole('button',{name:'다른'}).focus();
  fireEvent.keyDown(document,{key:'Escape'});
  expect(t).toHaveAttribute('aria-expanded','false');
  expect(t).toHaveFocus();
 });
 it('키보드 포커스로 열린다',()=>{
  render(<HelpHint label='도움말' text='설명'/>);
  const t=screen.getByRole('button',{name:'도움말'});
  fireEvent.focus(t);
  expect(t).toHaveAttribute('aria-expanded','true');
  fireEvent.blur(t);
  expect(t).toHaveAttribute('aria-expanded','false');
 });
 it('터치 탭은 호버를 열지 않아 다시 탭하면 닫히고, 마우스 호버는 열린다',()=>{
  render(<HelpHint label='도움말' text='설명'/>);
  const t=screen.getByRole('button',{name:'도움말'}),root=t.parentElement!;
  fireEvent.pointerEnter(root,{pointerType:'touch'});
  expect(t).toHaveAttribute('aria-expanded','false');
  fireEvent.click(t);
  expect(t).toHaveAttribute('aria-expanded','true');
  fireEvent.click(t);
  expect(t).toHaveAttribute('aria-expanded','false');
  fireEvent.pointerEnter(root,{pointerType:'mouse'});
  expect(t).toHaveAttribute('aria-expanded','true');
  fireEvent.pointerLeave(root,{pointerType:'mouse'});
  expect(t).toHaveAttribute('aria-expanded','false');
 });
 it('포인터로 얻은 포커스는 열지 않아 탭·클릭 토글이 정상 동작한다',()=>{
  render(<HelpHint label='도움말' text='설명'/>);
  const t=screen.getByRole('button',{name:'도움말'});
  fireEvent.pointerDown(t,{pointerType:'touch'});fireEvent.focus(t);fireEvent.click(t);
  expect(t).toHaveAttribute('aria-expanded','true');
  fireEvent.pointerDown(t,{pointerType:'touch'});fireEvent.click(t);
  expect(t).toHaveAttribute('aria-expanded','false');
 });
 it('포커스로 열린 상태도 바깥 누름으로 닫힌다',()=>{
  render(<><HelpHint label='도움말' text='설명'/><button>다른</button></>);
  const t=screen.getByRole('button',{name:'도움말'});
  fireEvent.focus(t);
  expect(t).toHaveAttribute('aria-expanded','true');
  fireEvent.pointerDown(screen.getByRole('button',{name:'다른'}));
  expect(t).toHaveAttribute('aria-expanded','false');
 });
 it('모든 언어에 비어 있지 않은 문구가 있다',()=>{
  for(const l of APP_LOCALES){expect(Object.values(walletHelpCopy(l)).every(x=>x.length>0)).toBe(true);}
 });
});
