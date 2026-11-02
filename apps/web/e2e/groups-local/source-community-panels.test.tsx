import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {afterEach,expect,it,vi} from 'vitest';
import {SourceCommunityPanel,SOURCE_COMMUNITY_PANELS,type SourceCommunityNodeId} from './source-community-panels';
afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.restoreAllMocks();});
const normalized=(value:string)=>value.replace(/\s+/g,' ').trim();
it.each(Object.keys(SOURCE_COMMUNITY_PANELS) as SourceCommunityNodeId[])('renders every source text and supplied image in %s',nodeId=>{
 const meta=SOURCE_COMMUNITY_PANELS[nodeId],{container}=render(<SourceCommunityPanel nodeId={nodeId} onClose={()=>{}}/>);
 expect(screen.getByRole('heading',{name:normalized(meta.title)})).toBeInTheDocument();
 const fields=Array.from(container.querySelectorAll<HTMLInputElement|HTMLTextAreaElement|HTMLSelectElement>('input,textarea,select')).map(input=>input.value).join(' '),rendered=normalized(container.textContent+' '+fields);
 for(const text of meta.texts)expect(rendered,`${nodeId}: ${text}`).toContain(normalized(text));
 for(const img of container.querySelectorAll('img')){expect(img.getAttribute('src')).toMatch(/^\/images\/groups\//);expect(existsSync(resolve('public'+img.getAttribute('src')))).toBe(true);}
 const root=container.querySelector('[data-source-community]') as HTMLElement;expect(root.style.width).toBe(meta.rootStyle.width);
});
it('filters the miniature directory and keeps actual page links',()=>{
 render(<SourceCommunityPanel nodeId='tHXNc' onClose={()=>{}}/>);
 expect(screen.getByRole('link',{name:/엔카이브 팬페이지/})).toHaveAttribute('href','/nchive');
 fireEvent.click(screen.getByRole('button',{name:'취미'}));
 expect(screen.queryByRole('link',{name:/엔카이브 팬페이지/})).toBeNull();
 fireEvent.change(screen.getByLabelText('페이지 이름이나 관심사 검색'),{target:{value:'독서'}});
 expect(screen.getAllByRole('link')).toHaveLength(1);expect(screen.getByRole('link',{name:/주말 독서 모임/})).toBeInTheDocument();
});
it('retains an edited post after retry and deletes only a local attachment',()=>{
 const retry=vi.fn(),fetch=vi.fn();vi.stubGlobal('fetch',fetch);
 const view=render(<SourceCommunityPanel nodeId='BXOYV' onClose={()=>{}} onRetry={retry}/>);
 fireEvent.change(screen.getByLabelText('제목'),{target:{value:'수정한 제목'}});
 fireEvent.click(screen.getByRole('button',{name:'사진 삭제'}));
 expect(screen.queryByRole('img',{name:'첨부한 사진'})).toBeNull();
 fireEvent.click(screen.getByRole('button',{name:'수정 완료'}));view.rerender(<SourceCommunityPanel nodeId='BXOYV' onClose={()=>{}} onRetry={retry}/>);
 expect(screen.getByLabelText('제목')).toHaveValue('수정한 제목');expect(retry).toHaveBeenCalledOnce();expect(fetch).not.toHaveBeenCalled();
});
it('allows local privacy choices without a server mutation and supports Escape',()=>{
 const close=vi.fn(),fetch=vi.fn();vi.stubGlobal('fetch',fetch);const {container}=render(<SourceCommunityPanel nodeId='g2dR1B' onClose={close}/>);
 fireEvent.click(screen.getByRole('radio',{name:'친구만'}));expect(screen.getByRole('radio',{name:'친구만'})).toBeChecked();
 fireEvent.click(screen.getByRole('checkbox',{name:'프로필 공개'}));expect(screen.getByRole('checkbox',{name:'프로필 공개'})).not.toBeChecked();
 fireEvent.keyDown(container.querySelector('section')!,{key:'Escape'});expect(close).toHaveBeenCalledOnce();expect(fetch).not.toHaveBeenCalled();
});
it('previews a chosen local file and preserves the source media restriction',()=>{
 const BrowserURL=URL,create=vi.fn(()=> 'blob:local-video');vi.stubGlobal('URL',class extends BrowserURL{static createObjectURL=create;static revokeObjectURL=vi.fn();});
 const {container}=render(<SourceCommunityPanel nodeId='BXOYV' onClose={()=>{}}/>);
 const picker=container.querySelector<HTMLInputElement>('input[type=file]')!;
 fireEvent.change(picker,{target:{files:[new File(['video'],'clip.mp4',{type:'video/mp4'})]}});
 expect(screen.getByRole('alert')).toHaveTextContent('사진과 영상은 함께 첨부할 수 없어요.');expect(create).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'사진 삭제'}));
 fireEvent.change(picker,{target:{files:[new File(['video'],'clip.mp4',{type:'video/mp4'})]}});
 expect(create).toHaveBeenCalledOnce();expect(container.querySelector('video')).toHaveAttribute('src','blob:local-video');
});
it('does not claim a playable video when only the source poster exists',()=>{
 const {container}=render(<SourceCommunityPanel nodeId='KJKkH' onClose={()=>{}}/>);
 expect(container.querySelector('video')).toBeNull();expect(screen.getAllByRole('img',{name:'첨부 영상 포스터'})).toHaveLength(2);
 expect(screen.getByRole('button',{name:'영상 1 선택'})).toHaveAttribute('aria-pressed','true');
});
it('ignores an unsupported source ID',()=>{
 const {container}=render(<SourceCommunityPanel nodeId='unknown' onClose={()=>{}}/>);expect(container).toBeEmptyDOMElement();
});
