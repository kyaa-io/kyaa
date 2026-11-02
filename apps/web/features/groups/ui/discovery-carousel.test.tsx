import {act,fireEvent,render,screen} from '@testing-library/react';
import {describe,it,expect,vi} from 'vitest';
import {DiscoveryCarousel} from './discovery-carousel';
describe('Pencil discovery carousel',()=>{
 it('changes the active slide and excludes the preview from interaction',()=>{
  const {container}=render(<DiscoveryCarousel locale='ko'/>);
  expect(screen.getByRole('link',{name:'러닝 모임 보기'})).toBeInTheDocument();
  expect(container.querySelectorAll('[inert]')).toHaveLength(2);
  fireEvent.click(screen.getByRole('button',{name:'다음 배너'}));
  expect(screen.getByRole('link',{name:'팬페이지 보기'})).toHaveAttribute('href',expect.stringContaining('type=fan'));
  expect(screen.queryByRole('link',{name:'러닝 모임 보기'})).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'이전 배너'}));
  expect(screen.getByRole('link',{name:'러닝 모임 보기'})).toBeInTheDocument();
 });
 it('advances after six seconds and stops when paused',()=>{
  vi.useFakeTimers();
  const {unmount}=render(<DiscoveryCarousel locale='ko'/>);
  act(()=>vi.advanceTimersByTime(6000));
  expect(screen.getByRole('link',{name:'팬페이지 보기'})).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'자동 넘김 일시정지'}));
  act(()=>vi.advanceTimersByTime(12000));
  expect(screen.getByRole('link',{name:'팬페이지 보기'})).toBeInTheDocument();
  unmount();
  vi.useRealTimers();
 });
});
