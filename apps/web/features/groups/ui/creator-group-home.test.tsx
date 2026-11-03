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
 expect(screen.getAllByRole('link',{name:/오늘 같이 본 영상 이야기해요/})[0]).toHaveAttribute('href',expect.stringContaining('#cheer-e9600000-0000-4000-8000-000000000002'));
 expect(screen.getByRole('link',{name:/출석 도장/})).toHaveAttribute('href','/my/wallet?view=attendance&locale=ko');expect(screen.getByRole('link',{name:/내 패스포트/})).toHaveAttribute('href','/passports/10000000-0000-4000-8000-000000000001?locale=ko');expect(screen.getAllByText(/오늘 같이 본 영상 이야기해요/)).toHaveLength(2);fireEvent.click(screen.getByRole('button',{name:'공지'}));expect(resource.read).toHaveBeenLastCalledWith('/api/celebrities/elina/feed?locale=ko&source=official&limit=20&news=notice');
});
