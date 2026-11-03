import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { PencilComposerPreview, PENCIL_COMPOSER_DEFAULTS } from './pencil-composer-preview';
import { pencilArtistCreator } from './pencil-artist-fixture';
vi.mock('@/features/groups/ui/group-shell',()=>({GroupShell:({children}:{children:React.ReactNode})=><main id='groups-main'>{children}</main>}));
vi.mock('@/features/groups/ui/creator-group-header',()=>({CreatorGroupHeader:()=> <header data-testid='creator-header'/>}));
vi.mock('@/features/groups/ui/creator-board-aside',()=>({CreatorBoardAside:()=> <aside aria-label='공통 게시판 사이드바'/>}));
vi.mock('@/components/fan-shell/fan-site-footer',()=>({FanSiteFooter:()=> <footer/>}));
const originalCreate=Object.getOwnPropertyDescriptor(URL,'createObjectURL'), originalRevoke=Object.getOwnPropertyDescriptor(URL,'revokeObjectURL'), create=vi.fn(),revoke=vi.fn();let sequence=0;
beforeAll(()=>{Object.defineProperty(URL,'createObjectURL',{configurable:true,value:create});Object.defineProperty(URL,'revokeObjectURL',{configurable:true,value:revoke});});
afterAll(()=>{if(originalCreate)Object.defineProperty(URL,'createObjectURL',originalCreate);else Reflect.deleteProperty(URL,'createObjectURL');if(originalRevoke)Object.defineProperty(URL,'revokeObjectURL',originalRevoke);else Reflect.deleteProperty(URL,'revokeObjectURL');});
beforeEach(()=>{sequence=0;create.mockReset().mockImplementation(()=>`blob:local-${++sequence}`);revoke.mockReset();});
const props={locale:'ko' as const,celebrity:pencilArtistCreator('ko'),onClose:vi.fn()};
const file=(name:string,type='image/png')=>new File(['local preview'],name,{type});
const picker=(container:HTMLElement)=>container.querySelector('input[type=file]') as HTMLInputElement;
function removeSourcePhotos(){while(screen.queryAllByRole('button',{name:/^사진 \d+ 삭제$/}).length)fireEvent.click(screen.getAllByRole('button',{name:/^사진 \d+ 삭제$/})[0]);}
it.each(['Urthu','wCL5S'] as const)('uses the source %s defaults and existing shared page pieces',nodeId=>{
 const view=render(<PencilComposerPreview {...props} nodeId={nodeId}/>);
 expect(screen.getByTestId('creator-header')).toBeInTheDocument();expect(screen.getByRole('complementary',{name:'공통 게시판 사이드바'})).toBeInTheDocument();
 expect(screen.getByRole('heading',{name:'글쓰기'})).toBeInTheDocument();expect(screen.getByRole('textbox',{name:'제목 필수'})).toHaveValue('가장 좋아하는 무대가 궁금해요');expect(screen.getByRole('textbox',{name:'내용'})).toHaveValue(PENCIL_COMPOSER_DEFAULTS.body);
 expect(screen.getByText('94 / 5,000')).toBeInTheDocument();expect(screen.getByText('엔카이브 팬페이지 · 자유게시판')).toBeInTheDocument();expect(screen.getByText('사진 최대 10장 또는 영상 1개')).toBeInTheDocument();
 expect(picker(view.container)).toHaveAttribute('accept','image/*,video/*');expect(picker(view.container)).toHaveAttribute('multiple');
 if(nodeId==='Urthu'){expect(screen.getByText('사진 2 / 10')).toBeInTheDocument();expect(screen.getByAltText('첨부 사진 2')).toHaveAttribute('src','/images/groups/source-community/51f39b3be29d92d4.jpg');}
 else{expect(screen.getByText('영상 1 / 1')).toBeInTheDocument();expect(screen.getByAltText('첨부 영상')).toHaveAttribute('src','/images/groups/source-community/video-example-poster.png');}
});
it('preserves the draft and attachments after rejected submission, and closes only after success',async()=>{
 const close=vi.fn(),submit=vi.fn().mockRejectedValueOnce(Error('local callback rejected')).mockResolvedValue(undefined),request=vi.fn();vi.stubGlobal('fetch',request);
 render(<PencilComposerPreview {...props} nodeId='Urthu' onClose={close} onSubmit={submit}/>);
 fireEvent.change(screen.getByRole('textbox',{name:'제목 필수'}),{target:{value:'수정한 제목'}});fireEvent.change(screen.getByRole('textbox',{name:'내용'}),{target:{value:'수정한 본문'}});fireEvent.change(screen.getByRole('combobox',{name:'공개 범위'}),{target:{value:'members'}});
 fireEvent.click(screen.getByRole('button',{name:'등록'}));await screen.findByRole('alert');expect(close).not.toHaveBeenCalled();expect(screen.getByRole('textbox',{name:'제목 필수'})).toHaveValue('수정한 제목');expect(screen.getByRole('textbox',{name:'내용'})).toHaveValue('수정한 본문');expect(screen.getByText('사진 2 / 10')).toBeInTheDocument();
 expect(submit).toHaveBeenLastCalledWith(expect.objectContaining({title:'수정한 제목',body:'수정한 본문',visibility:'members',attachments:expect.arrayContaining([expect.objectContaining({id:'source-photo-1'})])}));
 fireEvent.click(screen.getByRole('button',{name:'등록'}));await waitFor(()=>expect(close).toHaveBeenCalledOnce());expect(submit).toHaveBeenCalledTimes(2);expect(request).not.toHaveBeenCalled();
});
it('enforces the body character limit and required title before calling the local callback',()=>{
 const submit=vi.fn();render(<PencilComposerPreview {...props} nodeId='Urthu' onSubmit={submit}/>);
 const body=screen.getByRole('textbox',{name:'내용'});expect(body).toHaveAttribute('maxlength','5000');fireEvent.change(body,{target:{value:'가'.repeat(5000)}});expect(screen.getByText('5,000 / 5,000')).toBeInTheDocument();expect(screen.getByRole('button',{name:'등록'})).toBeEnabled();
 fireEvent.change(body,{target:{value:'가'.repeat(5001)}});expect(screen.getByRole('button',{name:'등록'})).toBeDisabled();fireEvent.change(body,{target:{value:'본문'}});fireEvent.change(screen.getByRole('textbox',{name:'제목 필수'}),{target:{value:'   '}});expect(screen.getByRole('button',{name:'등록'})).toBeDisabled();expect(submit).not.toHaveBeenCalled();
});
it('rejects over-limit, mixed and non-media selections before allocating any preview URLs',()=>{
 const view=render(<PencilComposerPreview {...props} nodeId='Urthu'/>);removeSourcePhotos();
 fireEvent.change(picker(view.container),{target:{files:Array.from({length:11},(_,i)=>file(`${i}.png`))}});expect(screen.getByRole('alert')).toHaveTextContent('사진 최대 10장 또는 영상 1개');expect(create).not.toHaveBeenCalled();
 fireEvent.change(picker(view.container),{target:{files:[file('one.png'),file('one.mp4','video/mp4')]}});expect(create).not.toHaveBeenCalled();
 fireEvent.change(picker(view.container),{target:{files:[file('document.pdf','application/pdf')]}});expect(screen.getByRole('alert')).toHaveTextContent('사진 또는 영상 파일을 선택해 주세요.');expect(create).not.toHaveBeenCalled();
});
it('revokes owned object URLs when removed or unmounted and permits one actual local video preview',()=>{
 const view=render(<PencilComposerPreview {...props} nodeId='Urthu'/>);removeSourcePhotos();
 fireEvent.change(picker(view.container),{target:{files:[file('one.png')]}});expect(screen.getByAltText('첨부 사진 1')).toHaveAttribute('src','blob:local-1');fireEvent.change(picker(view.container),{target:{files:[file('one.mp4','video/mp4')]}});expect(create).toHaveBeenCalledOnce();
 fireEvent.click(screen.getByRole('button',{name:'사진 1 삭제'}));expect(revoke).toHaveBeenCalledWith('blob:local-1');fireEvent.change(picker(view.container),{target:{files:[file('one.mp4','video/mp4')]}});expect(view.container.querySelector('video')).toHaveAttribute('src','blob:local-2');expect(view.container.querySelector('video')).toHaveAttribute('controls');view.unmount();expect(revoke.mock.calls.map(call=>call[0])).toEqual(['blob:local-1','blob:local-2']);
});
it('rolls back partial URL allocation if the browser cannot create a preview',()=>{
 const view=render(<PencilComposerPreview {...props} nodeId='Urthu'/>);removeSourcePhotos();create.mockImplementationOnce(()=> 'blob:first').mockImplementationOnce(()=>{throw Error('preview unavailable');});
 fireEvent.change(picker(view.container),{target:{files:[file('one.png'),file('two.png')]}});expect(screen.getByRole('alert')).toHaveTextContent('첨부 미리보기를 만들지 못했어요.');expect(revoke).toHaveBeenCalledWith('blob:first');expect(screen.queryByAltText('첨부 사진 1')).not.toBeInTheDocument();view.unmount();expect(revoke).toHaveBeenCalledOnce();
});
