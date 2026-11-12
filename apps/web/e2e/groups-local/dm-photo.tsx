import React from 'react';
import {createRoot} from 'react-dom/client';
import {Conversation} from '../../features/group-social/conversation';
import styles from '../../features/group-social/chat-dock.module.css';
import '../../app/globals.css';
import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css';
const id='20000000-0000-4000-8000-000000000002',person='10000000-0000-4000-8000-000000000001';
const original=window.fetch.bind(window);
window.fetch=async (input,init)=>{
 const url=String(input instanceof Request?input.url:input);
 if(url.includes('/api/me/social/conversations/')&&url.includes('/messages'))return Response.json({messages:[{id:'30000000-0000-4000-8000-000000000003',senderProfileId:person,text:'사진과 함께',createdAt:'2026-11-13T08:00:00Z',isMine:true,attachment:{assetId:'50000000-0000-4000-8000-000000000005',kind:'image'}}]});
 if(url.includes('/api/media/'))return original('/images/groups/nchive-group.webp',init);
 return Response.json({});
};
const chat={id,profileId:person,nickname:'예시 대화',avatarUrl:null,status:'accepted',canSend:true,latestMessage:'사진과 함께'};
createRoot(document.getElementById('root')!).render(<><div style={{padding:24}}>로컬 예시 데이터 · DM 사진 검증</div><section className={styles.dock} data-chat-dock><header className={styles.header}><h2 className={styles.name}>예시 대화</h2></header><div className={styles.body}><Conversation embedded locale='ko' id={id} conversation={chat} onResolve={()=>{}} onBack={()=>{}} pending={false}/></div></section></>);
