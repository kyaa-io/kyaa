import {expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {legacyVisualFixture} from './legacy-visual-fixtures';
import {pencilArtistCreator,pencilArtistFixture} from './pencil-artist-fixture';
import {groupDetailSchema} from '@/features/groups/domain/contracts';
import {certificationListItemSchema} from '@/features/certification/domain/certification';
const root='http://localhost:3128',nchive='e9200000-0000-4000-8000-000000000001',elina='e9200000-0000-4000-8000-000000000002';
it('ARCH001 preserves distinct resolver identities and group activity destinations',async()=>{
 for(const [slug,id] of [['nchive',nchive],['elina',elina]]){
  const fixture=slug==='nchive'?pencilArtistFixture:legacyVisualFixture;
  const response=await fixture(new URL(`${root}/api/groups/resolve/${slug}`),'GET','ko','creator');
  expect(groupDetailSchema.parse(await response!.json()).page).toMatchObject({id,celebrityId:id,slug,kind:'fan'});
  const activities=await fixture(new URL(`${root}/api/groups/${id}/activities`),'GET','ko','creator');
  expect(await activities!.json()).toMatchObject({certificationHref:`/${slug}?tab=certifications`});
 }
});
it('ARCH001 keeps original cheer IDs while reprojecting NCHIVE',async()=>{
 const path='/api/celebrities/elina/feed';
 const original=await legacyVisualFixture(new URL(root+path),'GET','ko','creator')!.json();
 const projected=await (await pencilArtistFixture(new URL(root+path.replace('elina','nchive')),'GET','ko','creator'))!.json();
 const originalCheer=original.items.find((item:{kind:string})=>item.kind==='cheer');
 expect(originalCheer).toBeDefined();
 expect(projected.items.find((item:{id:string})=>item.id===originalCheer.id)?.kind).toBe('cheer');
});
it('ARCH001 keeps main deliberate overrides ahead of linked fan details and a single policy wrapper',()=>{
 const source=readFileSync('e2e/groups-local/main.tsx','utf8');
 expect(source.indexOf("&&state==='invite-invalid'")).toBeLessThan(source.indexOf("if(linkedPage&&"));
 expect(source.indexOf("&&view==='raffle')return json({page:")).toBeLessThan(source.indexOf("if(linkedPage&&"));
 expect(source.match(/window.fetch = withLocalPolicyFixture/g)).toHaveLength(1);
});

it('ARCH001 NCHIVE resolver uses its existing localized factory summary',async()=>{for(const locale of ['ko','en'] as const){const response=await pencilArtistFixture(new URL(`${root}/api/groups/resolve/nchive`),'GET',locale,'creator');expect(groupDetailSchema.parse(await response!.json()).page.description).toBe(pencilArtistCreator(locale).summary);}});
it('UI022 keeps NCHIVE public quiz separate from unavailable private history',async()=>{
 for(const locale of ['ko','en'] as const){
  const response=await pencilArtistFixture(new URL(`${root}/api/celebrities/nchive/certifications?locale=${locale}`),'GET',locale,'creator');
  const body=await response!.json();expect(body.certifications).toHaveLength(1);
  expect(certificationListItemSchema.parse(body.certifications[0])).toMatchObject({id:'616381b2-96f7-4746-87f2-4c060614f125',kind:'quiz',reward:{scorePoints:1,ticketAmount:0},actionHref:`/c/nchive/verify?locale=${locale}`});
  const history=await pencilArtistFixture(new URL(`${root}/api/me/celebrities/nchive/certifications`),'GET',locale,'creator');expect(history!.status).toBe(503);
 }
 const elina=legacyVisualFixture(new URL(`${root}/api/celebrities/elina/certifications`),'GET','ko','creator');expect((await elina!.json()).certifications[0].kind).toBe('live_mission');
 const unsupported=await pencilArtistFixture(new URL(`${root}/api/celebrities/nchive/certifications?locale=ja`),'GET','ko','creator');expect(unsupported!.status).toBe(400);
});
