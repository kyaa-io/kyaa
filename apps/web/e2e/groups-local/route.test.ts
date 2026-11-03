import {describe,it,expect} from 'vitest';
import {fixtureRoute} from './route';
describe('local review navigation',()=>{
 it('routes MY and wallet utility links to their existing screens',()=>{for(const [path,view] of [['/passports/example','passport'],['/passports','passports'],['/my/activity','history'],['/live/calendar','calendar'],['/benefits','benefits']]){const route=fixtureRoute(path,'?locale=ja');expect(route.view).toBe(view);expect(route.query.get('locale')).toBe('ja');}const creators=fixtureRoute('/celebrities','?locale=ko&q=엘리나');expect(creators.view).toBe('directory');expect(creators.query.get('type')).toBe('fan');expect(creators.query.get('search')).toBe('엘리나');expect(fixtureRoute('/celebrities','?groups=off').view).toBe('celebrities');});

 it('keeps each mission identity when following a production link',()=>{for(const missionId of ['e9200000-0000-4000-8000-000000000001','e9400000-0000-4000-8000-000000000002','e9400000-0000-4000-8000-000000000003']){const route=fixtureRoute(`/pages/groups/e9200000-0000-4000-8000-000000000001/missions/${missionId}`,'?locale=ko');expect(route.view).toBe('mission-detail');expect(route.query.get('missionId')).toBe(missionId);expect(route.query.get('locale')).toBe('ko');}});
 it('preserves artist identity and local utility routes',()=>{expect(fixtureRoute('/c/nchive/community/e9800000-0000-4000-8000-000000000001','')).toMatchObject({view:'creator-post',creatorSlug:'nchive',postId:'e9800000-0000-4000-8000-000000000001'});for(const [path,view] of [['/my/capsules','capsules'],['/my/presence','presence'],['/my/profile','profile'],['/admin/groups','admin-overview']])expect(fixtureRoute(path,'').view).toBe(view);});
 it('opens the requested Pencil artist home at the server root',()=>{expect(fixtureRoute('/','').view).toBe('creator');expect(fixtureRoute('/nchive','').view).toBe('creator');expect(fixtureRoute('/nchive','?view=video').view).toBe('video');});
 it('preserves explicit visual fixture states',()=>{
  const route=fixtureRoute('/','?view=raffle&state=closed&locale=ja');
  expect(route.view).toBe('raffle');expect(route.query.get('state')).toBe('closed');
 });
 it('opens the selected brand and its event',()=>{
  const id='e9200000-0000-4000-8000-000000000004';
  const route=fixtureRoute(`/pages/groups/${id}`,'?tab=board');
  expect(route.pageId).toBe(id);expect(route.view).toBe('detail');expect(route.query.get('kind')).toBe('brand');expect(route.query.get('tab')).toBe('board');
  expect(fixtureRoute(`/pages/groups/${id}/events/example`,'').view).toBe('event');
 });
 it('keeps a group post and search state on direct navigation',()=>{
  const route=fixtureRoute('/pages/groups/e9200000-0000-4000-8000-000000000003','?tab=board&post=e9300000-0000-4000-8000-000000000003&search=weekend&sort=popular');
  expect(route.view).toBe('detail');
  expect(route.query.get('post')).toBe('e9300000-0000-4000-8000-000000000003');
  expect(route.query.get('search')).toBe('weekend');
  expect(route.query.get('sort')).toBe('popular');
 });
 it('distinguishes the app attendance query from the harness view',()=>{
  const route=fixtureRoute('/my/wallet','?view=attendance&locale=ko');
  expect(route.view).toBe('wallet');expect(route.query.get('section')).toBe('attendance');
  expect(fixtureRoute('/pages/groups/apply','?kind=fan').view).toBe('apply');
 });
});

it('keeps confirmation sheets over their original task context',()=>{
 const post=fixtureRoute('/nchive','?state=fNe6I');expect(post.view).toBe('creator-post');expect(post.creatorSlug).toBe('nchive');
 const composer=fixtureRoute('/nchive','?state=RS2uz');expect(composer.view).toBe('creator');expect(composer.query.get('composer')).toBe('wCL5S');
 const raffle=fixtureRoute('/nchive','?state=x3FJF');expect(raffle.view).toBe('manage');expect(raffle.query.get('section')).toBe('raffles');
});

it('keeps the real referral route and recipient query separate from friend QR links',()=>{const r=fixtureRoute('/my/invitations','?locale=ko&code=ABC123&destination=%2Fnchive');expect(r.view).toBe('referral');expect(r.query.get('code')).toBe('ABC123');expect(r.query.get('destination')).toBe('/nchive');});
