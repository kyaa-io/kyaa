"use client";
import type {Route} from 'next';
import { GroupArtistMark } from "./group-artist-mark";
import {groupOwnReportsCopy} from './group-own-reports-copy';
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import { FanPostRow } from "@/components/fan-ui/fan-post-row";
import { fanPostPageImage } from "@/components/fan-ui/fan-post-page-image";
import { FanSkeleton, FanSkeletonRows, FanSkeletonStatus } from "@/components/fan-ui/fan-skeleton";
import { fanUiText } from "@/components/fan-ui/fan-ui-copy";
import { fanLoginHref } from "@/components/login-href";
import { GroupPostArticle } from "./group-post-article";
import { GroupPostComposer, type GroupPostInput } from "./group-post-composer";
import { registrationReward } from "@/features/fan-posts/domain/registration-reward";
import { announceMissionSkip } from "@/features/fan-posts/ui/mission-skip-notice";
import { showMissionRewardToast } from "@/features/fan-posts/ui/mission-reward-toast";
import { notifyFanActivityUpdated } from "@/components/fan-ui/fan-activity-updates";
import { useByUsAuth } from "@/features/auth/client/cognito-auth";
import { useByUsSession } from "@/components/byus-session-provider";
import { FanAction } from "@/components/fan-ui/fan-action";
import { FanSectionLink } from "@/components/fan-ui/fan-section-link";
import type { AppLocale } from "@/i18n/locales";
import { RelativeTime } from "@/components/relative-time";
import { groupPostsSchema, type GroupDetail } from "../domain/contracts";
import { useGroupResource } from "./use-group-resource";
import { groupsCopy } from "./copy";
import { managementCopy } from "./management-copy";
import { interactionCopy } from "./interaction-copy";
import { boardCopy,boardPopularLabel } from "./board-copy";
import { groupHomeCopy } from "./home-copy";
import styles from "./groups.module.css";
import {SourceConfirmDialog,SourceDiscardDialog,sourceDeleteResultCopy} from "./source-confirm-dialog";
import {SourceStatePanel} from "./source-state-panel";
import previewStyles from "./group-home-source.module.css";
import boardStyles from "./group-board.module.css";
import {useOptionalGroupPage} from "./group-page-context";
import homeStyles from "./creator-group-home.module.css";
import { FanState } from "@/components/fan-ui/fan-state";
import { FanTabs } from "@/components/fan-ui/fan-tabs";
import { noPostsText, viewAllText } from "@/features/media/ui/gallery-copy";
import {paginationCopy} from "@/i18n/catalogs/common__pagination";
const postSchema=groupPostsSchema.shape.items.element.extend({assets:z.array(z.object({id:z.uuid(),kind:z.enum(["image","video"]),width:z.number().nullable().optional(),height:z.number().nullable().optional()})).optional(),bodyDoc:z.unknown().optional(),bodyDocUnavailable:z.boolean().optional(),category:z.enum(['notice','free']).optional(),commentCount:z.number().int().nonnegative().optional(),viewCount:z.number().int().nonnegative().optional(),likeCount:z.number().int().nonnegative().optional(),liked:z.boolean().optional(),disliked:z.boolean().optional(),dislikeCount:z.number().int().nonnegative().nullable().optional(),canEdit:z.boolean().optional(),canDelete:z.boolean().optional()});
const postsSchema=groupPostsSchema.extend({items:z.array(postSchema)});
export const parseGroupPosts=(v:unknown)=>postsSchema.parse(v);
const parseList=parseGroupPosts,parsePost=(v:unknown)=>postSchema.parse(v);
export type BoardLocation={category?:string;search?:string;sort?:string;cursor?:string};
export function GroupBoard({detail,locale,preview=false,compact=false,heading,initialPostId,initialBoardState={},listHref,onJoin,joinPending=false,joinLabel}:{joinLabel?:string;onJoin?:()=>void;joinPending?:boolean;listHref?:string;detail:GroupDetail;locale:AppLocale;preview?:boolean;compact?:boolean;heading?:string;initialPostId?:string;initialBoardState?:BoardLocation}){
 const auth=useByUsAuth(),session=useByUsSession();
 const t=groupsCopy(locale),m=managementCopy(locale),b=boardCopy(locale),c=interactionCopy(locale),home=groupHomeCopy(locale),base=`/api/groups/${detail.page.id}`;
 // 미션 카드의 `글쓰기`가 `compose=1`로 들어온다. 가입한 팬에게만 바로 작성 화면을 연다.
 const composeRequested=useSearchParams()?.get('compose')==='1'&&!preview&&Boolean(detail.membership);
 const [category,setCategory]=useState(initialBoardState.category??'all'),[search,setSearch]=useState(initialBoardState.search??''),[draft,setDraft]=useState(initialBoardState.search??''),[sort,setSort]=useState(initialBoardState.sort??'recent'),[selected,setSelected]=useState<string|undefined>(initialPostId),[writing,setWriting]=useState(()=>composeRequested),[editing,setEditing]=useState(false),[busy,setBusy]=useState(false),[failed,setFailed]=useState(false);
 const [cursor,setCursor]=useState<string|undefined>(initialBoardState.cursor),[previous,setPrevious]=useState<{key:string;items:z.infer<typeof postSchema>[]}>({key:'',items:[]});
 const [previewLimit,setPreviewLimit]=useState(20),[previewCursors,setPreviewCursors]=useState<(string|undefined)[]>([initialBoardState.cursor]);
 useEffect(()=>{if(!preview||compact)return;const media=window.matchMedia('(max-width: 767px)');const update=()=>{setPreviewLimit(media.matches?5:20);setCursor(undefined);setPreviewCursors([undefined]);};update();media.addEventListener('change',update);return()=>media.removeEventListener('change',update);},[preview,compact]);
 const previewRoot=useRef<HTMLElement>(null);
 // No public post on the server: the preview most likely opens empty, so its placeholder takes the empty line's height instead of five rows.
 const quietPreview=Boolean(useOptionalGroupPage()?.publicPostsEmpty);
 const goPreview=(cursors:(string|undefined)[])=>{setPreviewCursors(cursors);setCursor(cursors.at(-1));previewRoot.current?.focus({preventScroll:true});previewRoot.current?.scrollIntoView?.({block:'start'});};
 const list=useGroupResource(`${base}/posts?${new URLSearchParams({category,search,sort,limit:preview?String(compact?2:previewLimit):'30',...(cursor?{cursor}:{})})}`,parseList),post=useGroupResource(selected?`${base}/posts/${selected}?format=rich`:null,parsePost);
 // 화면에 보이는 값은 뒤에서 갱신 중일 수 있다. 수정 폼은 열 때 읽은 문서로만 시작한다.
 const editSource=useGroupResource(writing&&editing&&selected?`${base}/posts/${selected}?format=rich`:null,parsePost,{forEdit:true});
 useEffect(()=>{if(!writing)return;const prevent=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue='';};const guard=(event:MouseEvent)=>{const link=(event.target as Element|null)?.closest('a[href]');if(link&&!event.defaultPrevented&&!event.metaKey&&!event.ctrlKey&&!event.shiftKey&&!window.confirm(c.discard)){event.preventDefault();event.stopPropagation();}};window.addEventListener('beforeunload',prevent);document.addEventListener('click',guard,true);return()=>{window.removeEventListener('beforeunload',prevent);document.removeEventListener('click',guard,true);};},[writing,c.discard]);
 useEffect(()=>{const pop=()=>{if(writing&&!window.confirm(c.discard))return;const q=new URLSearchParams(window.location.search);setSelected(q.get('post')??undefined);setWriting(false);};window.addEventListener('popstate',pop);return()=>window.removeEventListener('popstate',pop);},[writing,c.discard]);
 const selectPost=(id?:string)=>{const url=new URL(window.location.href);url.pathname=`/pages/groups/${detail.page.id}`;url.searchParams.set('locale',locale);url.searchParams.set('tab',detail.page.kind==='brand'?'news':'board');for(const [key,value] of Object.entries({category,search,sort,cursor}))if(value)url.searchParams.set(key,value);else url.searchParams.delete(key);if(id)url.searchParams.set('post',id);else url.searchParams.delete('post');window.history.pushState(null,'',`${url.pathname}${url.search}`);setSelected(id);};
 const writeTrigger=useRef<HTMLSpanElement>(null),composerRef=useRef<HTMLFormElement>(null);
 const [discardOpen,setDiscardOpen]=useState(false);
 const [reported,setReported]=useState(false),[deleteDialog,setDeleteDialog]=useState<{id:string;title:string;uncertain:boolean;open:boolean}|null>(null),[deleteChecking,setDeleteChecking]=useState(false);
 const pending=useRef<{input:string;requestId:string}|undefined>(undefined);
 const reset=()=>{setCursor(undefined);setPreviewCursors([undefined]);setPrevious({key:'',items:[]});};
 const send=async(path:string,method:string,input:Record<string,unknown>,onDone?:(response:unknown)=>void)=>{if(busy)return false;setBusy(true);setFailed(false);const key=JSON.stringify([path,method,input]);if(pending.current?.input!==key)pending.current={input:key,requestId:crypto.randomUUID()};try{const response=await list.request(`${base}/${path}`,{method,body:JSON.stringify({...input,requestId:pending.current.requestId})});pending.current=undefined;try{onDone?.(response);}catch{/* the post is saved: a failed toast or refresh never turns it into a failure */}if(path==='reports')setReported(true);list.retry();post.retry();return true;}catch{setFailed(true);return false;}finally{setBusy(false);}};
 const write=async(input:GroupPostInput)=>{const result=await send(editing&&selected?`posts/${selected}`:'posts',editing?'PATCH':'POST',input,editing?undefined:response=>{notifyFanActivityUpdated(session.ownerId??auth.user?.id);announceMissionSkip(locale,'post',response);const reward=registrationReward(response);if(reward)showMissionRewardToast(locale,'post',reward);});if(result){setWriting(false);setEditing(false);reset();}return result;};
 const items=[...(previous.key===list.ownerKey?previous.items:[]),...(list.data?.items??[])];
 // 필터·검색·페이지를 바꾸는 동안 이전 목록을 그대로 둔다. 스켈레톤은 값이 한 번도 없을 때만 그린다.
 const listData=list.data,listKey=items.map(item=>item.id).join();
 const [keptList,setKeptList]=useState({key:'',items});
 if(listData&&keptList.key!==listKey)setKeptList({key:listKey,items});
 const kept=keptList.items;
 const shown=listData?items:kept,listBusy=!listData&&!list.error&&kept.length>0;
 const postHref=(id:string)=>`/pages/groups/${detail.page.id}?${new URLSearchParams({locale,tab:detail.page.kind==='brand'?'news':'board',post:id})}`;
 const thumbnailOf=(item:typeof items[number])=>{const asset=item.visibility==='public'?item.assets?.find(a=>a.kind==='image'):undefined;return asset?`/api/groups/media/${asset.id}?variant=thumbnail`:null;};
 const rowPageImage=fanPostPageImage({slug:detail.page.slug,src:detail.page.imageUrl});
 const writeAction=detail.membership?<span ref={writeTrigger} className={preview?undefined:styles.boardWrite}><FanAction variant='primary' onClick={()=>{setWriting(true);setEditing(false);}}>{m.write}</FanAction></span>:!list.authenticated?<span className={preview?undefined:styles.boardWrite}><FanAction variant='primary' href={fanLoginHref(locale,`/pages/groups/${detail.page.id}?locale=${locale}&tab=${detail.page.kind==='brand'?'news':'board'}`)}>{m.write}</FanAction></span>:onJoin?<span className={preview?undefined:styles.boardWrite}><FanAction variant='primary' disabled={joinPending} onClick={onJoin}>{m.write}</FanAction></span>:null;
 return <section ref={preview?previewRoot:undefined} tabIndex={preview?-1:undefined} className={preview&&!compact?`${homeStyles.stories} ${previewStyles.preview}`:`${styles.status} ${compact?styles.compactBoard:""} ${preview?styles.homeBoard:""}`} style={{justifyItems:'stretch'}}>{discardOpen&&<SourceDiscardDialog locale={locale} pending={busy} onContinue={()=>setDiscardOpen(false)} onDiscard={()=>{setDiscardOpen(false);setWriting(false);setEditing(false);setTimeout(()=>writeTrigger.current?.querySelector('button')?.focus(),0);}}/>}{deleteDialog?.open&&<SourceConfirmDialog sourceId={deleteDialog.uncertain?'nwlo0':'G0fL7'} title={deleteDialog.uncertain?sourceDeleteResultCopy(locale).title:locale==='ko'?'게시글을 삭제할까요?':c.remove} cancelLabel={t.cancel} confirmLabel={deleteDialog.uncertain?sourceDeleteResultCopy(locale).check:m.remove} closeLabel={t.cancel} pending={busy||deleteChecking} danger={!deleteDialog.uncertain} onClose={()=>setDeleteDialog(old=>old?{...old,open:false}:null)} onConfirm={()=>{if(deleteDialog.uncertain){setDeleteChecking(true);void list.request(`${base}/posts/${deleteDialog.id}`).then(value=>{parsePost(value);setDeleteDialog(old=>old?{...old,uncertain:false}:null);post.retry();}).catch(()=>{post.retry();list.retry();}).finally(()=>setDeleteChecking(false));}else void send(`posts/${deleteDialog.id}`,'DELETE',{}).then(ok=>{setDeleteDialog(old=>old?{...old,uncertain:!ok,open:!ok}:null);if(ok)selectPost(undefined);});}}><p>{deleteDialog.title}</p>{deleteDialog.uncertain&&<p>{sourceDeleteResultCopy(locale).body}</p>}</SourceConfirmDialog>}{!selected&&!writing&&<header className={preview&&!compact?homeStyles.storiesHeader:undefined}><h2>{heading??(detail.page.kind==='brand'?t.news:preview?home.stories:t.board)}</h2>{preview&&!compact&&<FanSectionLink href={`/pages/groups/${detail.page.id}?locale=${locale}&tab=board`}>{viewAllText(locale)}</FanSectionLink>}</header>}
 {!selected&&!writing&&<>{preview&&!compact&&<div className={homeStyles.toolbar}><FanTabs variant='chip' label={t.board} current={category} items={['all','notice','free'].map(value=>({key:value,label:value==='all'?t.all:b[value as 'notice'|'free'],onSelect:()=>{reset();setCategory(value);}}))}/>{writeAction}</div>}{!preview&&<div className={styles.toolbar}><div className={styles.filters}>{['all','notice','free'].map(value=><button key={value} className={styles.chip} aria-pressed={category===value} onClick={()=>{reset();setCategory(value);}}>{value==='all'?t.all:b[value as 'notice'|'free']}</button>)}</div><form className={styles.search} onSubmit={e=>{e.preventDefault();reset();setSearch(draft.trim());}}><input className={styles.input} value={draft} onChange={e=>setDraft(e.target.value)} aria-label={t.search} maxLength={100}/><button className={styles.chip}>{t.search}</button></form><select className={styles.select} aria-label={boardPopularLabel[locale]} value={sort} onChange={e=>{reset();setSort(e.target.value);}}><option value='recent'>{t.recent}</option><option value='popular'>{boardPopularLabel[locale]}</option></select>{writeAction}</div>}
 {list.error?<div role='alert'><p>{t.error}</p><FanAction onClick={list.retry}>{t.retry}</FanAction></div>:!listData&&!kept.length?(preview&&!compact&&quietPreview?<div className={homeStyles.emptyStories}><FanSkeletonRows rows={1}/></div>:<FanSkeletonRows rows={5} variant='post'/>):shown.length?<div className={`${boardStyles.list} ${preview&&!compact?boardStyles.previewList:''}`} aria-busy={listBusy||undefined}>{(preview?shown.slice(0,compact?2:previewLimit):shown).map(item=><div key={item.id} onClickCapture={event=>{if(event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;event.preventDefault();selectPost(item.id);}}><FanPostRow href={postHref(item.id)} locale={locale} title={item.title} thumbnail={thumbnailOf(item)} pageImage={rowPageImage} notice={item.category==='notice'} commentCount={compact?undefined:item.commentCount} author={item.artist?`${item.nickname} · ${fanUiText(locale,'artistTag')}`:item.operator?`${item.nickname} · ${fanUiText(locale,'operatorTag')}`:item.nickname} time={item.createdAt} edited={Boolean(item.editedAt)} views={item.viewCount} likes={item.likeCount} density={preview?'home':'board'}/></div>)}</div>:<div className={preview&&!compact?homeStyles.emptyStories:undefined}><FanState inline compact kind='empty' title={noPostsText(locale)}/></div>}
 {preview&&!compact&&list.data&&(items.length>0||previewCursors.length>1)&&<nav className={previewStyles.pagination} aria-label={t.board}><button type='button' aria-label={paginationCopy(locale).previous} disabled={previewCursors.length===1} onClick={()=>goPreview(previewCursors.slice(0,-1))}><ChevronLeft size={20}/></button>{previewCursors.map((_,index)=><button type='button' key={index} aria-current={index===previewCursors.length-1?'page':undefined} onClick={()=>goPreview(previewCursors.slice(0,index+1))}>{index+1}</button>)}{list.data.nextCursor&&<button type='button' onClick={()=>goPreview([...previewCursors,list.data!.nextCursor??undefined])}>{previewCursors.length+1}</button>}<button type='button' aria-label={paginationCopy(locale).next} disabled={!list.data.nextCursor} onClick={()=>goPreview([...previewCursors,list.data!.nextCursor??undefined])}><ChevronRight size={20}/></button></nav>}
 {!preview&&list.data?.nextCursor&&<FanAction onClick={()=>{setPrevious({key:list.ownerKey,items});setCursor(list.data!.nextCursor??undefined);}}>{t.more}</FanAction>}</>}
 {selected&&!writing&&<><FanAction className={styles.boardBack} variant='text' leadingIcon={<ArrowLeft size={16}/>} {...(listHref?{href:listHref as Route}:{onClick:()=>selectPost(undefined)})}>{b.back}</FanAction>{post.error?<SourceStatePanel fill sourceId='Z6ErKw' title={locale==='ko'?'게시글을 불러오지 못했어요':t.error} description={t.error} role='alert' actions={[{label:t.retry,onClick:post.retry,variant:'primary'}]}/>:post.data?<GroupPostArticle pageId={detail.page.id} post={post.data} locale={locale} member={Boolean(detail.membership)} authenticated={list.authenticated} busy={busy} onRefresh={post.retry} onReact={(choice,current)=>(choice==='dislike'||(choice==='none'&&current==='dislike')?send(`posts/${selected}/dislike`,'PUT',{disliked:choice==='dislike'}):send(`posts/${selected}/reaction`,'PUT',{liked:choice==='like'}))} onEdit={()=>{setWriting(true);setEditing(true);}} onDelete={()=>setDeleteDialog(old=>({id:selected!,title:post.data!.title,uncertain:old?.id===selected&&old.uncertain||false,open:true}))} onReport={()=>{const reason=window.prompt(b.reason);if(reason?.trim())void send('reports','POST',{targetType:'post',targetId:selected,reason});}} onJoin={onJoin} joinPending={joinPending} joinLabel={joinLabel}/>:<div aria-busy='true'><FanSkeletonStatus locale={locale}/><FanSkeleton width='60%' height={28}/><FanSkeleton shape='block' height={160}/></div>}</>}
 {writing&&editing&&editSource.error&&<SourceStatePanel fill sourceId='Z6ErKw' title={locale==='ko'?'게시글을 불러오지 못했어요':t.error} description={t.error} role='alert' actions={[{label:t.retry,onClick:editSource.retry,variant:'primary'},{label:t.cancel,onClick:()=>{setWriting(false);setEditing(false);}}]}/>}
 {writing&&editing&&!editSource.error&&!editSource.data&&<FanSkeletonRows rows={3} variant='plain' ariaLabel={t.loading}/>}
 {writing&&(!editing||editSource.data)&&<GroupPostComposer key={editing?selected:'new'} locale={locale} heading={editing?b.edit:m.write} post={editing?editSource.data:undefined} canWriteNotice={Boolean(detail.membership&&detail.membership.role!=='member')} busy={busy} formRef={composerRef} onSubmit={write} onCancel={dirty=>{if(dirty)setDiscardOpen(true);else{setWriting(false);setEditing(false);}}}/>}
 {failed&&<SourceStatePanel fill sourceId={writing?'MY9YB':undefined} title={locale==='ko'&&writing?'게시글을 등록하지 못했어요':t.error} description={t.error} role='alert' actions={writing?[{label:t.retry,onClick:()=>composerRef.current?.requestSubmit(),disabled:busy,variant:'primary'}]:[]}/>}{reported&&<SourceStatePanel fill sourceId='uYLjw' title={locale==='ko'?'신고가 접수되었어요':b.report} description={t.receivedNote} role='status' actions={[{label:groupOwnReportsCopy(locale)[0],href:`/my/groups/reports?locale=${locale}`}]}/>}
 </section>;
}
