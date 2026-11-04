import {beforeAll,afterAll} from 'vitest';
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
 vi.useFakeTimers();vi.stubGlobal('matchMedia',vi.fn(()=>({matches:true})));render(<CapsuleReveal result={result} locale='ko'/>);expect(screen.getByText('캡슐 연출을 줄이고 같은 뽑기 결과를 확인할 수 있어요.')).toBeInTheDocument();expect(document.querySelector('[data-source-state="cRVyO"] img')).toHaveAttribute('width','160');act(()=>vi.advanceTimersByTime(119));expect(screen.queryByText('꽝')).not.toBeInTheDocument();act(()=>vi.advanceTimersByTime(1));expect(screen.getByText('꽝')).toBeInTheDocument();
});
it('opens only the committed results when the video ends',()=>{
 vi.stubGlobal('matchMedia',vi.fn(()=>({matches:false})));const fetch=vi.fn();vi.stubGlobal('fetch',fetch);
 const view=render(<CapsuleReveal result={result} locale='ko'/>);const video=view.container.querySelector('video')!;
 expect(video).toHaveAttribute('playsinline');expect(video).not.toHaveAttribute('loop');
 fireEvent.ended(video);expect(screen.getByText('꽝')).toBeInTheDocument();expect(fetch).not.toHaveBeenCalled();
});
it('keeps a poster and result action on media error or loading timeout',()=>{
 vi.useFakeTimers();vi.stubGlobal('matchMedia',vi.fn(()=>({matches:false})));
 const view=render(<CapsuleReveal result={result} locale='ko'/>);
 fireEvent.error(view.container.querySelector('video')!);
 expect(view.container.querySelector('video')).toBeNull();expect(view.container.querySelector('img[src$="reveal-poster.webp"]')).not.toBeNull();
 fireEvent.click(screen.getByRole('button',{name:'결과 바로 보기'}));expect(screen.getByText('꽝')).toBeInTheDocument();
 view.unmount();const second=render(<CapsuleReveal result={result} locale='ko'/>);act(()=>vi.advanceTimersByTime(10000));expect(second.container.querySelector('video')).toBeNull();
});
it('falls back when autoplay is rejected without another draw',async()=>{
 vi.stubGlobal('matchMedia',vi.fn(()=>({matches:false})));vi.spyOn(HTMLMediaElement.prototype,'play').mockRejectedValueOnce(new Error('NotAllowedError'));
 const view=render(<CapsuleReveal result={result} locale='ko'/>);await act(async()=>{});
 expect(view.container.querySelector('video')).toBeNull();fireEvent.click(screen.getByRole('button',{name:'결과 바로 보기'}));expect(screen.getByText('꽝')).toBeInTheDocument();
});

it('shows every committed result and its receipt balance without inventing a prize or drawing again',()=>{
 const fetch=vi.fn(),onReturn=vi.fn();vi.stubGlobal('fetch',fetch);
 const results=Array.from({length:10},(_,index)=>({index:index+1,prizeId:index===1?id:null,name:index===1?'실제 경품':null,imageUrl:null}));
 render(<CapsuleReveal result={{...result,count:10,results,tickets:2}} locale='ko' onReturn={onReturn}/>);
 fireEvent.click(screen.getByRole('button',{name:'결과 바로 보기'}));
 expect(screen.getByRole('heading',{name:'캡슐 10개의 결과'})).toBeInTheDocument();
 expect(screen.getAllByRole('listitem')).toHaveLength(10);
 expect(screen.getAllByText('꽝')).toHaveLength(9);
 expect(screen.getByText('실제 경품')).toBeInTheDocument();
 expect(screen.getByText('2장')).toBeInTheDocument();
 expect(screen.getByText('경품 1개 당첨')).toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'뽑기 화면으로'}));
 expect(onReturn).toHaveBeenCalledOnce();expect(fetch).not.toHaveBeenCalled();
});

it('renders optional source result navigation from the committed receipt',()=>{
 const results=Array.from({length:10},(_,index)=>({index:index+1,prizeId:[1,7].includes(index)?id:null,name:[1,7].includes(index)?'굿즈 당첨':null,imageUrl:[1,7].includes(index)?'/images/groups/nchive-goods-concept.png':null}));
 const view=render(<CapsuleReveal result={{...result,count:10,results,tickets:2}} locale='ko' onReturn={()=>{}} presentation={{header:null,aside:null,creatorName:'엔카이브',historyHref:'/?view=capsules&state=es3y5',claimHref:'/?view=raffle&state=cWqGx'}}/>);
 fireEvent.click(screen.getByRole('button',{name:'결과 바로 보기'}));expect(screen.getByRole('heading',{name:'엔카이브 굿즈 2개 당첨'})).toBeInTheDocument();expect(view.container.querySelectorAll('li[data-won=true]')).toHaveLength(2);expect(screen.getByRole('link',{name:'수령 방법 확인'})).toHaveAttribute('href','/?view=raffle&state=cWqGx');expect(screen.getByRole('link',{name:'뽑기 기록'})).toHaveAttribute('href','/?view=capsules&state=es3y5');
});

const dialogPrototype=HTMLDialogElement.prototype,originalShowModal=Object.getOwnPropertyDescriptor(dialogPrototype,'showModal'),originalClose=Object.getOwnPropertyDescriptor(dialogPrototype,'close');
beforeAll(()=>{vi.spyOn(HTMLMediaElement.prototype,'play').mockResolvedValue();Object.defineProperty(dialogPrototype,'showModal',{configurable:true,value:function(this:HTMLDialogElement){this.open=true;}});Object.defineProperty(dialogPrototype,'close',{configurable:true,value:function(this:HTMLDialogElement){this.open=false;}});});
afterAll(()=>{if(originalShowModal)Object.defineProperty(dialogPrototype,'showModal',originalShowModal);else Reflect.deleteProperty(dialogPrototype,'showModal');if(originalClose)Object.defineProperty(dialogPrototype,'close',originalClose);else Reflect.deleteProperty(dialogPrototype,'close');});

it('keeps the receipt after Escape and reopens it without another request',()=>{
 const fetch=vi.fn();vi.stubGlobal('fetch',fetch);render(<CapsuleReveal result={result} locale='ko'/>);
 fireEvent.click(screen.getByRole('button',{name:'결과 바로 보기'}));
 expect(screen.getByRole('dialog')).toBeInTheDocument();expect(document.body.style.overflow).toBe('hidden');
 fireEvent.keyDown(screen.getByRole('dialog'),{key:'Escape'});
 expect(screen.queryByRole('dialog')).not.toBeInTheDocument();expect(document.body.style.overflow).not.toBe('hidden');
 const reopen=screen.getByRole('button',{name:'뽑기 결과'});expect(reopen).toHaveFocus();fireEvent.click(reopen);
 expect(screen.getByRole('dialog')).toBeInTheDocument();expect(screen.getByText('꽝')).toBeInTheDocument();expect(screen.getByText('11장')).toBeInTheDocument();expect(fetch).not.toHaveBeenCalled();
});
