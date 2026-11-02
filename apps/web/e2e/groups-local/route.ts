// Translate real app links into the local fixture views without changing production links.
export function fixtureRoute(pathname:string, search:string){
 const query=new URLSearchParams(search);
 const sourceState=(query.get('state')??'').replace(/^source-/,'');
 const confirmationBackgrounds:Record<string,string>={G0fL7:'/c/nchive/community/e9800000-0000-4000-8000-000000000001',fNe6I:'/c/nchive/community/e9800000-0000-4000-8000-000000000001',BCMPW:'/nchive?composer=Urthu',RS2uz:'/nchive?composer=wCL5S',qUpqC:'/pages/groups/e9200000-0000-4000-8000-000000000001/raffles/e9200000-0000-4000-8000-000000000001',HbVi5:'/pages/groups/e9200000-0000-4000-8000-000000000001/raffles/e9200000-0000-4000-8000-000000000001',PRK1L:'/pages/groups/e9200000-0000-4000-8000-000000000001/manage?section=raffles',x3FJF:'/pages/groups/e9200000-0000-4000-8000-000000000001/manage?section=raffles',O2tSZ:'/pages/groups/e9200000-0000-4000-8000-000000000003/manage?section=members',IVPEq:'/pages/groups/e9200000-0000-4000-8000-000000000003/manage?section=members',A2n0y:'/pages/groups/e9200000-0000-4000-8000-000000000003/manage?section=settings',g6zYRZ:'/pages/groups/e9200000-0000-4000-8000-000000000003/manage?section=settings',N9TgPu:'/nchive',Neylr:'/nchive',jn589:'/pages/groups/e9200000-0000-4000-8000-000000000001/events/e9200000-0000-4000-8000-000000000001',n0s8Gm:'/pages/groups/e9200000-0000-4000-8000-000000000001/events/e9200000-0000-4000-8000-000000000001'};
 if(confirmationBackgrounds[sourceState]){const background=new URL(confirmationBackgrounds[sourceState],'http://localhost');pathname=background.pathname;for(const key of ['view','tab','post','section','kind','composer'])query.delete(key);for(const [key,value] of background.searchParams)query.set(key,value);}

 const match=pathname.match(/^\/pages\/groups\/(e9200000-0000-4000-8000-\d{12})(?:\/(.*))?$/);
 const post=pathname.match(/^\/c\/(elina|nchive)\/community\/(e9800000-0000-4000-8000-\d{12})$/);
 let view=query.get('view');
 if(post)view='creator-post';
 else if((pathname==='/elina'||pathname==='/nchive'||pathname==='/')&&!view)view='creator';
 else if(/^\/groups\/invitations\/[a-f0-9-]{36}$/.test(pathname)){view='membership-invitation';query.set('invitationId',pathname.split('/')[3]!);}
 else if(pathname==='/my/invitations')view='referral';
 else if(pathname==='/my/wallet'){
  if(view==='attendance'||view==='support')query.set('section',view);
  view='wallet';
 }else if(pathname==='/pages/groups/apply')view='apply';
 else if(pathname.startsWith('/passports/')){view='passport';query.set('passportId',pathname.split('/')[2]);}
 else if(pathname==='/passports')view='passports';
 else if(pathname==='/my/activity')view='history';
 else if(pathname.startsWith('/live/calendar/schedules/'))view='calendar-schedule';
 else if((pathname==='/live/source-nchive-live'||pathname.startsWith('/live/source-ifew-')))view='calendar-live';
 else if(pathname==='/live/calendar')view='calendar';
 else if(pathname==='/benefits')view='benefits';
 else if(pathname==='/celebrities'){view=query.get('groups')==='off'?'celebrities':'directory';query.set('type','fan');if(query.has('q'))query.set('search',query.get('q')!);}
 else if(pathname==='/my')view='my';
 else if(pathname==='/my/friends')view='social';
 else if(pathname==='/my/capsules')view='capsules';
 else if(pathname==='/my/presence')view='presence';
 else if(pathname==='/my/profile')view='profile';
 else if(pathname==='/settings')view='settings';
 else if(pathname==='/notifications')view='notifications';
 else if(pathname==='/admin/groups'&&!view)view='admin-overview';
 else if(match){
  const part=match[2]?.split('/')[0];
  if(part==='gifts'&&query.get('view')==='history')query.set('viewMode','history');
  if(part==='gifts'&&match[2]?.split('/')[1])query.set('applicationId',match[2].split('/')[1]);
  view=part==='gifts'?'gift':part==='events'?'event':part==='raffles'?'raffle':part==='missions'?(match[2]?.split('/')[1]?'mission-detail':'mission'):part==='manage'?'manage':'detail';
  if(part==='missions'&&match[2]?.split('/')[1])query.set('missionId',match[2].split('/')[1]);
  const index=Number(match[1].slice(-12));
  query.set('kind',index<=2?'fan':index===4?'brand':'hobby');
 }
 return {query,view,pageId:match?.[1],postId:post?.[2],creatorSlug:post?.[1]??(pathname==='/nchive'?'nchive':undefined)};
}
