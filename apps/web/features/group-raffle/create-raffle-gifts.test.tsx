import {render,screen,fireEvent,waitFor}from'@testing-library/react';
import{beforeEach,it,expect,vi}from'vitest';
import{CreateGroupRaffle}from'./create-raffle';
const mocks=vi.hoisted(()=>({request:vi.fn(),push:vi.fn(),outsideFirstPage:false}));
vi.mock('next/navigation',()=>({useRouter:()=>({push:mocks.push})}));
const page='e9740000-0000-4000-8000-000000000003',id='e9740000-0000-4000-8000-000000000005';
vi.mock('@/features/groups/ui/use-group-resource',()=>({useGroupRequest:()=>({request:mocks.request}),useGroupResource:(url:string)=>url?.endsWith('/e9740000-0000-4000-8000-000000000005')?{data:{application:{id:'e9740000-0000-4000-8000-000000000005',name:'Approved gift',conditions:'Approved conditions',imageUrl:'/api/groups/images/e9740000-0000-4000-8000-000000000004',fulfillmentMethod:'on_site_pickup',availableQuantity:3,status:'approved'}}}:({data:{items:mocks.outsideFirstPage?[]:[{id:'e9740000-0000-4000-8000-000000000005',name:'Approved gift',conditions:'Approved conditions',imageUrl:'/api/groups/images/e9740000-0000-4000-8000-000000000004',fulfillmentMethod:'on_site_pickup',availableQuantity:3}],nextCursor:null}})}));
beforeEach(()=>{Object.defineProperty(HTMLDialogElement.prototype,'showModal',{configurable:true,value:function(this:HTMLDialogElement){this.open=true;}});Object.defineProperty(HTMLDialogElement.prototype,'close',{configurable:true,value:function(this:HTMLDialogElement){this.open=false;}});vi.clearAllMocks();mocks.outsideFirstPage=false;vi.stubGlobal('confirm',vi.fn(()=>true));mocks.request.mockResolvedValue({id});});
function fill(){fireEvent.change(screen.getByRole('spinbutton',{name:'당첨 인원'}),{target:{value:'2'}});const form=screen.getByRole('button',{name:'추첨 만들기'}).closest('form')!;fireEvent.change(form.querySelector('[name=closesAt]')!,{target:{value:'2030-11-07T18:00'}});fireEvent.change(form.querySelector('[name=submissionDays]')!,{target:{value:'7'}});return form;}
it('carries an approved same-page gift into the real raffle create request and preserves a failed request ID',async()=>{mocks.request.mockRejectedValueOnce(new Error('stock changed'));render(<CreateGroupRaffle pageId={page} locale='ko' initialGiftId={id}/>);expect(screen.getByRole('textbox',{name:'추첨 이름'})).toHaveValue('Approved gift');expect(screen.getByRole('spinbutton',{name:'당첨 인원'})).toHaveAttribute('max','3');const form=fill();fireEvent.submit(form);fireEvent.click(screen.getByRole('dialog').querySelector('footer button:last-child')!);await screen.findByRole('alert');expect(mocks.push).not.toHaveBeenCalled();fireEvent.submit(form);fireEvent.click(screen.getByRole('dialog').querySelector('footer button:last-child')!);await waitFor(()=>expect(mocks.push).toHaveBeenCalled());const first=JSON.parse(mocks.request.mock.calls[0][1].body),second=JSON.parse(mocks.request.mock.calls[1][1].body);expect(first).toEqual(second);expect(first).toMatchObject({giftApplicationId:id,title:'Approved gift',summary:'Approved conditions',fulfillmentMethod:'on_site_pickup',winnerQuantity:2});});
it('keeps direct creation available without a gift ID',async()=>{render(<CreateGroupRaffle pageId={page} locale='ko'/>);const form=fill();fireEvent.change(form.querySelector('[name=title]')!,{target:{value:'Direct gift'}});fireEvent.change(form.querySelector('[name=fulfillmentMethod]')!,{target:{value:'digital'}});fireEvent.submit(form);fireEvent.click(screen.getByRole('dialog').querySelector('footer button:last-child')!);await waitFor(()=>expect(mocks.push).toHaveBeenCalled());expect(JSON.parse(mocks.request.mock.calls[0][1].body)).not.toHaveProperty('giftApplicationId');});

it('loads an approved linked gift even when it is outside the first list page',async()=>{mocks.outsideFirstPage=true;render(<CreateGroupRaffle pageId={page} locale='ko' initialGiftId={id}/>);expect(screen.getByRole('textbox',{name:'추첨 이름'})).toHaveValue('Approved gift');expect(screen.getByRole('option',{name:'Approved gift · 사용 가능 수량 3'})).toHaveValue(id);fireEvent.submit(fill());fireEvent.click(screen.getByRole('dialog').querySelector('footer button:last-child')!);await waitFor(()=>expect(mocks.push).toHaveBeenCalled());expect(JSON.parse(mocks.request.mock.calls[0][1].body).giftApplicationId).toBe(id);});

it('creates a free one-entry raffle with a start and configurable activity conditions',async()=>{
 render(<CreateGroupRaffle pageId={page} locale='ko' initialGiftId={id}/>);
 const form=fill();
 fireEvent.click(screen.getByRole('button',{name:'무료 1회'}));
 fireEvent.click(screen.getByRole('button',{name:'출석 일수 3'}));
 fireEvent.click(screen.getByRole('button',{name:'승인된 미션 1'}));
 fireEvent.change(screen.getByRole('spinbutton',{name:'출석 일수'}),{target:{value:'5'}});
 fireEvent.change(form.querySelector('[name=opensAt]')!,{target:{value:'2030-11-01T09:00'}});
 expect(form.querySelector('[name=perUserLimit]')).toBeNull();
 fireEvent.submit(form);fireEvent.click(screen.getByRole('dialog').querySelector('footer button:last-child')!);
 await waitFor(()=>expect(mocks.push).toHaveBeenCalled());
 expect(JSON.parse(mocks.request.mock.calls[0][1].body)).toMatchObject({entryMode:'free',perUserLimit:1,opensAt:new Date('2030-11-01T09:00').toISOString(),conditions:[{type:'attendance_days',min:5},{type:'mission_approved',min:1}]});
});
it('removes an unselected condition and rejects a start after closing before confirmation',()=>{
 render(<CreateGroupRaffle pageId={page} locale='ko' initialGiftId={id}/>);const form=fill();
 fireEvent.click(screen.getByRole('button',{name:'글·댓글 1'}));fireEvent.click(screen.getByRole('button',{name:'글·댓글 1'}));
 expect(screen.queryByRole('spinbutton',{name:'글·댓글'})).not.toBeInTheDocument();
 fireEvent.change(form.querySelector('[name=opensAt]')!,{target:{value:'2030-11-08T09:00'}});fireEvent.submit(form);
 expect(screen.queryByRole('dialog')).not.toBeInTheDocument();expect(screen.getByRole('alert')).toBeInTheDocument();expect(mocks.request).not.toHaveBeenCalled();
});
