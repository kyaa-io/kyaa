import {useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {GroupManageScreen} from '@/features/groups/ui/group-manage-screen';
import {GroupBoard} from '@/features/groups/ui/group-board';
import {GroupOperatorNotices} from '@/features/groups/ui/group-operator-notices';
import {GroupOperatorStats} from '@/features/groups/ui/group-operator-stats';
import {parseAppLocale} from '@/i18n/locales';
import '@/app/globals.css';
import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css';
window.confirm=()=>true;
const q=new URLSearchParams(location.search),locale=parseAppLocale(q.get('locale')),pageId=q.get('page')??'';
// view=board 는 팬이 보는 게시판(공지 표시·분류 필터)을 같은 서버 위에서 연다.
function BoardView(){
 const [detail,setDetail]=useState<any>(null);
 useEffect(()=>{fetch(`/api/groups/${pageId}`,{headers:{authorization:`Bearer dog:${q.get('as')}`}}).then(r=>r.json()).then(setDetail);},[]);
 return detail?<GroupBoard detail={detail} locale={locale}/>:<p>loading</p>;
}
const defects=<main style={{padding:16,maxWidth:960,margin:'0 auto',display:'grid',gap:24}}><GroupOperatorStats pageId={pageId} locale={locale}/><GroupOperatorNotices pageId={pageId} locale={locale}/></main>;
createRoot(document.getElementById('root')!).render(q.get('view')==='defects'?defects:q.get('view')==='board'?<BoardView/>:<GroupManageScreen pageId={pageId} locale={locale} initialSection={q.get('section')??undefined}/>);
