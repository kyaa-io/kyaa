import { expect,it } from 'vitest';
import { applicationFixture,applicationFixtureId } from './application-fixtures';
import { applicationReceiptSchema } from '../../features/groups/domain/contracts';
it('distinguishes approved from received and preserves the original photo on a local revision',async()=>{
 const path='/api/groups/applications',approved=await applicationFixture(path,'GET',null,'application-approved')!.json();expect(approved.items[0].status).toBe('approved');
 const before=await applicationFixture(path,'GET',null,'application-changes')!.json();expect(before.items[0]).toMatchObject({status:'changes_requested',reason:expect.any(String),imageUrl:'/images/groups/running-event.png'});
 const receipt=await applicationFixture(path+'/'+applicationFixtureId,'PATCH',{name:'한강 러닝 크루',description:'토요일 오전 반포 한강공원에서 함께 달려요.',question:before.items[0].question,requestId:crypto.randomUUID()},'application-changes')!.json();expect(applicationReceiptSchema.parse(receipt).status).toBe('submitted');
 const after=await applicationFixture(path,'GET',null,'application-changes')!.json();expect(after.items[0]).toMatchObject({status:'submitted',imageUrl:before.items[0].imageUrl,description:'토요일 오전 반포 한강공원에서 함께 달려요.'});expect(before.items[0].description).toBe('한강에서 함께 달려요.');
});
