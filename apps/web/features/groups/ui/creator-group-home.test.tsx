import {render,screen,fireEvent} from '@testing-library/react';
import {expect,it,vi} from 'vitest';
import {CreatorGroupHome} from './creator-group-home';
import {legacyVisualCreator,legacyVisualFixture} from '../../../e2e/groups-local/legacy-visual-fixtures';
import {feedPageSchema} from '@/features/fan-posts/domain/feed';
const resource=vi.hoisted(()=>({read:vi.fn(),data:undefined as unknown}));
vi.mock('./creator-group-home-aside',()=>({CreatorGroupHomeAside:()=>null}));
vi.mock('@/features/media/ui/creator-media-panel',()=>({CreatorMediaPanel:()=>null}));
vi.mock('@/features/fanpage/ui/use-community-resource',()=>({useCommunityResource:(url:string)=>{resource.read(url);return {state:{status:'ready',data:resource.data},retry:()=>{}};}}));
it('uses the existing creator feed and original detail URLs for the compact home, without copying group posts',async()=>{
 resource.data=feedPageSchema.parse(await legacyVisualFixture(new URL('http://localhost/api/celebrities/elina/feed'),'GET','ko','creator')!.json());
 render(<CreatorGroupHome celebrity={legacyVisualCreator('ko')} locale='ko' channelId={null} passportId='10000000-0000-4000-8000-000000000001'/>);
 expect(resource.read).toHaveBeenCalledWith('/api/celebrities/elina/feed?locale=ko&source=all&limit=20');expect(screen.getAllByRole('link',{name:/처음 오셨다면/})[0]).toHaveAttribute('href',expect.stringContaining('/c/elina/notices/fixture-welcome?locale=ko'));
 expect(screen.getAllByRole('link',{name:/오늘 같이 본 영상 이야기해요/})[0]).toHaveAttribute('href',expect.stringContaining('/c/elina/community/e9600000-0000-4000-8000-000000000002?source=cheer&locale=ko&returnTo='));
 expect(screen.getByRole('link',{name:/출석 스탬프/})).toHaveAttribute('href','/my/wallet?view=attendance&locale=ko');expect(screen.getByRole('link',{name:/내 패스포트/})).toHaveAttribute('href','/passports/10000000-0000-4000-8000-000000000001?locale=ko');expect(screen.getAllByText(/오늘 같이 본 영상 이야기해요/)).toHaveLength(1);fireEvent.click(screen.getByRole('button',{name:'공지'}));expect(resource.read).toHaveBeenLastCalledWith('/api/celebrities/elina/feed?locale=ko&source=official&limit=20&news=notice');
});

it('submits normalized search, resets pagination, and retains a composer intent link',()=>{
 resource.read.mockClear();resource.data=feedPageSchema.parse({items:[],nextCursor:'next-page'});
 render(<CreatorGroupHome celebrity={legacyVisualCreator('ko')} locale='ko' channelId={null}/>);
 expect(screen.getByRole('button',{name:'다음 페이지'})).toBeEnabled();
 fireEvent.click(screen.getByRole('button',{name:'다음 페이지'}));
 expect(resource.read).toHaveBeenLastCalledWith(expect.stringContaining('cursor=next-page'));
 fireEvent.change(screen.getByRole('searchbox'),{target:{value:'  cafe\u0301  '}});
 fireEvent.submit(screen.getByRole('search'));
 const url=resource.read.mock.calls.at(-1)![0] as string;
 expect(new URL(url,'http://localhost').searchParams.get('q')).toBe('café');
 expect(new URL(url,'http://localhost').searchParams.has('cursor')).toBe(false);
 expect(screen.getAllByRole('link',{name:'글쓰기'})).toHaveLength(1);
 expect(screen.getByRole('link',{name:'글쓰기'})).toHaveAttribute('href',expect.stringContaining('source=fans&locale=ko&compose=1'));
 expect(screen.queryByRole('link',{name:'게시판 전체 보기'})).toBeNull();
});

it('draws the home board as post rows: bold notice with a tag, no table, no dash columns',()=>{
 resource.data=feedPageSchema.parse({items:[{kind:'notice',noticeKind:'standard',id:'10000000-0000-4000-8000-000000000001',slug:'first',title:'공지 제목',postType:'notice',visibility:'public',revision:1,publishedAt:'2026-11-01T10:00:00Z',body:{},commentCount:2,likeCount:0,liked:false,pinned:false}],nextCursor:null});
 const view=render(<CreatorGroupHome celebrity={legacyVisualCreator('ko')} locale='ko' channelId={null}/>);
 expect(view.container.querySelector('table')).toBeNull();expect(view.container.textContent).not.toContain('—');
 const row=view.container.querySelector('[data-fan-post-row]')!;expect(row).toHaveAttribute('data-notice');expect(row.querySelector('[data-fan-tag="notice"]')).toHaveTextContent('공지');expect(row.querySelector('[aria-label="댓글 2"]')).toHaveTextContent('2');
});
