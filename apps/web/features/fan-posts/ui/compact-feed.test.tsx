import {fireEvent,render,screen} from '@testing-library/react';
import {expect,it,vi} from 'vitest';
import {CompactFeed} from './compact-feed';
import {feedPageSchema} from '../domain/feed';
import {legacyVisualFixture} from '../../../e2e/groups-local/legacy-visual-fixtures';
vi.mock('./feed-item-card',()=>({FeedItemCard:()=> <div>응원 글 상세</div>}));
it('keeps notice links and allows a cheer row to expand',async()=>{
 const response=legacyVisualFixture(new URL('http://localhost/api/celebrities/elina/feed'),'GET','ko','creator')!;
 const {items}=feedPageSchema.parse(await response.json());
 const {container}=render(<CompactFeed items={items} slug='elina' locale='ko' returnTo='/elina?tab=board' onChanged={()=>{}}/>);
 expect(screen.getByRole('link',{name:/처음 오셨다면/})).toHaveAttribute('href',expect.stringContaining('/c/elina/notices/fixture-welcome'));
 const summary=container.querySelector('summary')!;
 const details=summary.parentElement as HTMLDetailsElement;
 expect(details.open).toBe(false);fireEvent.click(summary);expect(details.open).toBe(true);
});
