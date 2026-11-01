import { act,fireEvent,render,screen } from '@testing-library/react';
import { afterEach,expect,it,vi } from 'vitest';
import { CapsuleReveal } from './capsule-reveal';
const id='10000000-0000-4000-8000-000000000001';
const result={requestKey:id,campaignId:id,count:1 as const,results:[{index:1,prizeId:null,name:null,imageUrl:null}],tickets:11};
afterEach(()=>vi.useRealTimers());
it('reveals the same committed result on skip without another request',()=>{
 vi.useFakeTimers();const fetch=vi.fn();vi.stubGlobal('fetch',fetch);render(<CapsuleReveal result={result} locale='ko'/>);expect(screen.queryByText('꽝')).not.toBeInTheDocument();fireEvent.click(screen.getByRole('button',{name:'결과 바로 보기'}));expect(screen.getByText('꽝')).toBeInTheDocument();expect(fetch).not.toHaveBeenCalled();
});
it('reduces the committed reveal to 120ms when reduced motion is enabled',()=>{
 vi.useFakeTimers();vi.stubGlobal('matchMedia',vi.fn(()=>({matches:true})));render(<CapsuleReveal result={result} locale='ko'/>);act(()=>vi.advanceTimersByTime(119));expect(screen.queryByText('꽝')).not.toBeInTheDocument();act(()=>vi.advanceTimersByTime(1));expect(screen.getByText('꽝')).toBeInTheDocument();
});
it('uses the approved 720/1120/1600ms reveal phases',()=>{
 vi.useFakeTimers();vi.stubGlobal('matchMedia',vi.fn(()=>({matches:false})));const view=render(<CapsuleReveal result={result} locale='ko'/>);act(()=>vi.advanceTimersByTime(720));expect(view.container.firstElementChild).toHaveAttribute('data-capsule-phase','1');act(()=>vi.advanceTimersByTime(400));expect(view.container.firstElementChild).toHaveAttribute('data-capsule-phase','2');act(()=>vi.advanceTimersByTime(480));expect(screen.getByText('꽝')).toBeInTheDocument();
});
