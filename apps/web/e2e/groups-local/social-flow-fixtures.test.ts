import { expect,it } from 'vitest';
import { legacyVisualFixture } from './legacy-visual-fixtures';
const id='e9200000-0000-4000-8000-000000000001',root='http://localhost/api/me/social';
it('supports a local incoming accept/send/requery and separate outgoing request without claiming SQL persistence',async()=>{
 history.replaceState(null,'','/?view=social&state=incoming');
 const get=async(path:string)=>legacyVisualFixture(new URL(root+path),'GET','ko','social')!.json();
 expect((await get('/conversations')).conversations[0].status).toBe('incoming_request');
 legacyVisualFixture(new URL(root+'/conversations/'+id),'PATCH','ko','social',{action:'accept',requestId:crypto.randomUUID()});expect((await get('/conversations')).conversations[0]).toMatchObject({status:'accepted',canSend:true});
 legacyVisualFixture(new URL(root+'/conversations/'+id+'/messages'),'POST','ko','social',{text:'로컬 대화 확인',requestId:crypto.randomUUID()});expect((await get('/conversations/'+id+'/messages')).messages.at(-1)).toMatchObject({text:'로컬 대화 확인',isMine:true});
 legacyVisualFixture(new URL(root+'/conversations'),'POST','ko','social',{profileId:id,text:'새 대화 요청',requestId:crypto.randomUUID()});expect((await get('/conversations')).conversations[0]).toMatchObject({status:'outgoing_request',canSend:false});
});
