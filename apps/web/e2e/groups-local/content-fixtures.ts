// Loopback-only stateful API fixtures. Never production seed data.
const pageId='e9200000-0000-4000-8000-000000000001',postId='e9300000-0000-4000-8000-000000000001',now='2026-11-01T12:00:00Z';
const commentId='e9400000-0000-4000-8000-000000000001',assetId='e9500000-0000-4000-8000-000000000001';
const post={id:postId,pageId,title:'이번 주말 함께 달려요',body:'시간과 장소를 확인하고 함께 이야기해요.',visibility:'public',anonymous:false,profileId:pageId,nickname:'별빛',avatarUrl:null,createdAt:now,category:'free',commentCount:2,viewCount:12,likeCount:3,liked:false,canEdit:true,canDelete:true,assets:[{id:assetId,kind:'image',width:320,height:320}]};
const roomMessages=[{id:'e9600000-0000-4000-8000-000000000001',profileId:postId,nickname:'엘리나',body:'오늘도 함께 응원해 주셔서 고마워요!',createdAt:now,mine:false},{id:'e9600000-0000-4000-8000-000000000002',profileId:pageId,nickname:'하늘',body:'내일 무대도 기대할게요!',createdAt:now,mine:true}];
const roomConversations=new Map([[pageId,roomMessages]]);
let comments=[{id:commentId,body:'토요일 아침에 참여할게요.',profileId:pageId,nickname:'별빛',avatarUrl:null,anonymous:false,createdAt:now,parentId:null as string|null,canDelete:true,assets:[] as {id:string;kind:string;width:number;height:number}[]},{id:'e9400000-0000-4000-8000-000000000002',body:'좋아요, 같이 만나요!',profileId:pageId,nickname:'러너',avatarUrl:null,anonymous:false,createdAt:now,parentId:commentId,canDelete:true,assets:[{id:assetId,kind:'image',width:320,height:320}]}];
export function contentFixture(url:URL,method:string,body:Record<string,unknown>|null,state:string|null,brand=false,fan=false):Response|undefined{
 const posts=brand?['RUN&MUSIC FESTIVAL','브랜드 행사와 컬렉션'].map((title,i)=>({...post,id:`e9300000-0000-4000-8000-${String(i+1).padStart(12,'0')}`,title,commentCount:0,assets:[]})):[['처음 오셨다면 여기부터 확인해요','공지',0],['오늘 강바람이 시원했어요','러너 A · HIT',3],['주말 함께 뛸 분 계신가요?','러너 B',2],['첫 5km 완주했어요!','러너 C',5]].map(([title,nickname,commentCount],i)=>({...post,id:`e9300000-0000-4000-8000-${String(i+1).padStart(12,'0')}`,title:String(title),nickname:String(nickname),commentCount:Number(commentCount),category:i===0?'notice':'free',assets:[]}));
 const path=url.pathname,json=(v:unknown,status=200)=>Response.json(v,{status});
 if(!path.startsWith('/api/groups/'))return undefined;
 if(path.includes('/posts')){
  if(path.endsWith('/comments')&&method==='POST'){const id=crypto.randomUUID();comments.push({id,body:String(body?.body??''),profileId:pageId,nickname:'나',avatarUrl:null,anonymous:false,createdAt:now,parentId:typeof body?.parentId==='string'?body.parentId:null,canDelete:true,assets:[]});return json({id});}
  if(path.endsWith('/comments'))return json({items:comments,nextCursor:null});
  if(/\/comments\//.test(path)&&method==='DELETE'){comments=comments.filter(x=>x.id!==path.split('/').at(-1));return json({deleted:true});}
  if(path.endsWith('/reaction'))return json({liked:Boolean(body?.liked),count:body?.liked?4:3});
  if(path.endsWith('/posts'))return json({items:state==='empty'?[]:posts,nextCursor:null});
  if(/\/posts\/[\w-]+$/.test(path))return json(posts.find(item=>item.id===path.split('/').at(-1))??post);
 }
 if(path.endsWith('/rooms')&&['room-guest','room-nonmember','room-unavailable'].includes(state??''))return json({error:{code:state==='room-guest'?'AUTHENTICATION_REQUIRED':state==='room-nonmember'?'GROUPS_FORBIDDEN':'GROUPS_NOT_FOUND'}},state==='room-guest'?401:state==='room-nonmember'?403:404);
 if(path.endsWith('/rooms')&&fan&&!state)return json({items:[{id:pageId,name:'아티스트와 함께',minimumTier:'Gold',status:'open',canEnter:true,latestMessage:'오늘도 함께 응원해 주셔서 고마워요!',unreadCount:2},{id:'e9200000-0000-4000-8000-000000000002',name:'응원 이야기',minimumTier:'Gold',status:'open',canEnter:true,latestMessage:null,unreadCount:0}]});
 if(path.endsWith('/rooms')){const status=['scheduled','readonly','closed'].includes(state??'')?state!:'open';return json({items:[{id:pageId,name:'주말 러닝',minimumTier:['denied','tier-admitted'].includes(state??'')?'Gold':null,status,canEnter:state!=='denied'&&status!=='closed',opensAt:status==='scheduled'?'2026-12-01T09:00:00Z':null,closesAt:null,latestMessage:state==='denied'?null:'이번 주말 아침에 만나요.',unreadCount:state==='denied'?null:2}]});}
 if(fan&&path.includes('/rooms/')&&path.endsWith('/messages')){
  const roomId=path.split('/').at(-2)!,messages=roomConversations.get(roomId)??[];roomConversations.set(roomId,messages);
  if(method==='POST'){if(state==='send-failed')return json({error:{code:'GROUPS_UNAVAILABLE'}},503);const item={id:crypto.randomUUID(),profileId:pageId,nickname:'하늘',body:String(body?.body??''),createdAt:new Date().toISOString(),mine:true};messages.push(item);return json(item);}
  const after=url.searchParams.get('after');return json({items:after?messages.slice(messages.findIndex(item=>item.id===after)+1):messages});
 }
 if(path.endsWith('/read'))return json({readAt:now});
 return undefined;
}
