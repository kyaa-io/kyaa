// Loopback-only stateful API fixtures. Never production seed data.
const pageId='e9200000-0000-4000-8000-000000000001',postId='e9300000-0000-4000-8000-000000000001',now='2026-11-01T12:00:00Z';
const commentId='e9400000-0000-4000-8000-000000000001',assetId='e9500000-0000-4000-8000-000000000001';
const post={id:postId,pageId,title:'이번 주말 함께 달려요',body:'시간과 장소를 확인하고 함께 이야기해요.',visibility:'public',anonymous:false,profileId:pageId,nickname:'별빛',avatarUrl:null,createdAt:now,category:'free',commentCount:2,viewCount:12,likeCount:3,liked:false,canEdit:true,canDelete:true,assets:[{id:assetId,kind:'image',width:320,height:320}]};
const roomMessages=[{id:'e9600000-0000-4000-8000-000000000001',profileId:postId,nickname:'엘리나',avatarUrl:'/images/groups/elina-pencil.jpg',artist:true,body:'오늘도 함께 응원해 주셔서 고마워요!',createdAt:now,mine:false},{id:'e9600000-0000-4000-8000-000000000002',profileId:pageId,nickname:'하늘',body:'내일 무대도 기대할게요!',createdAt:now,mine:true}];
const roomConversations=new Map([[pageId,roomMessages]]);
const boardPosts=new Map<string,typeof post[]>();
let comments=[{id:commentId,body:'토요일 아침에 참여할게요.',profileId:pageId,nickname:'별빛',avatarUrl:null,anonymous:false,createdAt:now,parentId:null as string|null,canDelete:true,assets:[] as {id:string;kind:string;width:number;height:number}[]},{id:'e9400000-0000-4000-8000-000000000002',body:'좋아요, 같이 만나요!',profileId:pageId,nickname:'러너',avatarUrl:null,anonymous:false,createdAt:now,parentId:commentId,canDelete:true,assets:[{id:assetId,kind:'image',width:320,height:320}]}];
export function contentFixture(url:URL,method:string,body:Record<string,unknown>|null,state:string|null,brand=false,fan=false):Response|undefined{
 const posts=brand?['RUN&MUSIC FESTIVAL','브랜드 행사와 컬렉션'].map((title,i)=>({...post,id:`e9300000-0000-4000-8000-${String(i+1).padStart(12,'0')}`,title,commentCount:0,assets:[]})):[['처음 오셨다면 여기부터 확인해요','공지',0],['오늘 강바람이 시원했어요','러너 A · HIT',3],['주말 함께 달릴 분 계신가요?','러너 B',2],['첫 5km 완주했어요','러너 C',5]].map(([title,nickname,commentCount],i)=>({...post,id:`e9300000-0000-4000-8000-${String(i+1).padStart(12,'0')}`,title:String(title),nickname:String(nickname),commentCount:Number(commentCount),likeCount:[8,4,9,6][i]!,category:i===0?'notice':'free',operator:i===0,assets:[]}));
 const path=url.pathname,json=(v:unknown,status=200)=>Response.json(v,{status});
 const boardId=path.split('/')[3]??pageId;
 if(!brand&&posts.length===4){const titles=['한강에서 만난 풍경','천천히 달리는 아침','같이 듣고 싶은 러닝 음악','처음 달리는 분들을 위한 이야기','오늘의 러닝 기록','나만의 산책 코스','함께 달려서 즐거웠어요','운동 후 쉬어가는 시간','다음에 달리고 싶은 길','비 오는 날의 러닝','주말 러닝 이야기','가볍게 걷고 달려요','좋아하는 한강 풍경','러닝하며 발견한 순간','함께 나누고 싶은 기록','오늘도 수고했어요'];posts.push(...titles.map((title,index)=>({...post,pageId:boardId,id:`e9300000-0000-4000-8000-${String(index+5).padStart(12,'0')}`,title,nickname:'—',commentCount:0,likeCount:0,assets:[]})));}
 if(!boardPosts.has(boardId))boardPosts.set(boardId,posts.map(item=>({...item,pageId:boardId})));
 const board=boardPosts.get(boardId)!;


 if(!path.startsWith('/api/groups/'))return undefined;
 if(path.includes('/posts')){
  if(path.endsWith('/comments')&&method==='POST'){const id=crypto.randomUUID();comments.push({id,body:String(body?.body??''),profileId:pageId,nickname:'나',avatarUrl:null,anonymous:false,createdAt:now,parentId:typeof body?.parentId==='string'?body.parentId:null,canDelete:true,assets:[]});return json({id});}
  if(path.endsWith('/comments'))return json({items:comments.map((item,index)=>index===0?{...item,operator:true}:item),nextCursor:null});
  if(/\/comments\//.test(path)&&method==='DELETE'){comments=comments.filter(x=>x.id!==path.split('/').at(-1));return json({deleted:true});}
  if(path.endsWith('/reaction')){const item=board.find(row=>row.id===path.split('/').at(-2));if(!item)return json({error:{code:'NOT_FOUND'}},404);const liked=Boolean(body?.liked);if(item.liked!==liked)item.likeCount+=liked?1:-1;item.liked=liked;return json({liked,count:item.likeCount});}
  if(path.endsWith('/posts')&&method==='POST'){const id=crypto.randomUUID();board.unshift({...post,id,pageId:boardId,title:String(body?.title??''),body:String(body?.body??''),visibility:String(body?.visibility??'public'),category:String(body?.category??'free'),nickname:'나',createdAt:new Date().toISOString(),commentCount:0,viewCount:0,likeCount:0,assets:[]});return json({id});}
  if(/\/posts\/[\w-]+$/.test(path)&&method==='PATCH'){const item=board.find(row=>row.id===path.split('/').at(-1));if(!item)return json({error:{code:'NOT_FOUND'}},404);Object.assign(item,{title:String(body?.title??item.title),body:String(body?.body??item.body),visibility:String(body?.visibility??item.visibility),category:String(body?.category??item.category)});return json({id:item.id});}
  if(/\/posts\/[\w-]+$/.test(path)&&method==='DELETE'){const index=board.findIndex(row=>row.id===path.split('/').at(-1));if(index<0)return json({error:{code:'NOT_FOUND'}},404);board.splice(index,1);return json({deleted:true});}
  if(path.endsWith('/posts')){const category=url.searchParams.get('category')??'all',search=(url.searchParams.get('search')??'').trim().toLocaleLowerCase(),sort=url.searchParams.get('sort');const items=state==='empty'?[]:board.filter(item=>(category==='all'||item.category===category)&&item.title.toLocaleLowerCase().includes(search));items.sort((a,b)=>Number(b.category==='notice')-Number(a.category==='notice')||(sort==='popular'?b.likeCount-a.likeCount:0));const offset=Number(url.searchParams.get('cursor')??0),limit=Math.max(1,Math.min(100,Number(url.searchParams.get('limit')??30)));return json({items:items.slice(offset,offset+limit),nextCursor:offset+limit<items.length?String(offset+limit):null});}
  if(/\/posts\/[\w-]+$/.test(path))return json(board.find(item=>item.id===path.split('/').at(-1))??{error:{code:'NOT_FOUND'}});
 }
 if(path.endsWith('/rooms')&&['room-guest','room-nonmember','room-unavailable'].includes(state??''))return json({error:{code:state==='room-guest'?'AUTHENTICATION_REQUIRED':state==='room-nonmember'?'GROUPS_FORBIDDEN':'GROUPS_NOT_FOUND'}},state==='room-guest'?401:state==='room-nonmember'?403:404);
 if(path.endsWith('/rooms')&&fan&&!state)return json({items:[{id:pageId,name:'아티스트와 함께',minimumTier:'Gold',status:'open',canEnter:true,latestMessage:'오늘도 함께 응원해 주셔서 고마워요!',unreadCount:2},{id:'e9200000-0000-4000-8000-000000000002',name:'응원 이야기',minimumTier:'Gold',status:'open',canEnter:true,latestMessage:null,unreadCount:0}]});
 if(path.endsWith('/rooms')){const status=state==='readonly-operator'?'readonly':['scheduled','readonly','closed'].includes(state??'')?state!:'open';return json({items:[{id:pageId,name:'주말 러닝',minimumTier:['denied','tier-admitted'].includes(state??'')?'Gold':null,status,canEnter:state!=='denied'&&status!=='closed',opensAt:status==='scheduled'?'2026-12-01T09:00:00Z':null,closesAt:null,latestMessage:state==='denied'?null:'이번 주말 아침에 만나요.',unreadCount:state==='denied'?null:2}]});}
 if(fan&&path.includes('/rooms/')&&path.endsWith('/messages')){
  const roomId=path.split('/').at(-2)!,messages=roomConversations.get(roomId)??[];roomConversations.set(roomId,messages);
  if(method==='POST'){if(state==='send-failed')return json({error:{code:'GROUPS_UNAVAILABLE'}},503);const item={id:crypto.randomUUID(),profileId:pageId,nickname:'하늘',body:String(body?.body??''),createdAt:new Date().toISOString(),mine:true};messages.push(item);return json(item);}
  const after=url.searchParams.get('after');return json({canSend:state!=='readonly',items:after?messages.slice(messages.findIndex(item=>item.id===after)+1):messages,participants:messages.length?[{profileId:pageId,nickname:'하늘',avatarUrl:'/images/avatars/star-pink.webp',tier:'Gold'},{profileId:postId,nickname:'보라',avatarUrl:'/images/avatars/heart-lavender.webp',tier:'Gold'}]:[]});
 }
 if(path.endsWith('/read'))return json({readAt:now});
 return undefined;
}
