import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import {useRouter} from './navigation';
import type {AppLocale} from '../../i18n/locales';
import {FanAppHeader} from '../../components/fan-shell/fan-app-shell';
import {CreatorGroupHeader} from '../../features/groups/ui/creator-group-header';
import {pencilArtistCreator} from './pencil-artist-fixture';
import {DetailContext} from './pencil-detail-controls';
import {DETAIL_SCREENS,detailMarkup} from './pencil-detail-source';
import './pencil-detail-preview.css';
import {DETAIL_VARIANTS,detailVariantMarkup} from './pencil-detail-variants';
import {SourceTaskPanel,SourceTaskActions} from './source-task-panel';
import {FanAction} from '../../components/fan-ui/fan-action';
import {DETAIL_TASKS,taskBodyMarkup,taskActionMarkup} from './pencil-detail-tasks';
import taskBackgrounds from './pencil-task-backgrounds.json';
import groupStyles from '../../features/groups/ui/groups.module.css';
export {DETAIL_SCREENS};
export function PencilDetailPreview({locale,screen}:{locale:AppLocale;screen:string}){
 const router=useRouter();
 const [mobile,setMobile]=useState(()=>matchMedia('(max-width:767px)').matches),[message,setMessage]=useState(''),[photo,setPhoto]=useState(''),[dirty,setDirty]=useState(false),[exitPrompt,setExitPrompt]=useState(false),file=useRef<HTMLInputElement>(null),form=useRef<HTMLFormElement>(null),dirtyRef=useRef(false);
 useLayoutEffect(()=>{dirtyRef.current=dirty;},[dirty]);
 useEffect(()=>{const q=matchMedia('(max-width:767px)'),update=()=>setMobile(q.matches);q.addEventListener('change',update);return()=>q.removeEventListener('change',update);},[]);
 const explicit=DETAIL_SCREENS.find(s=>s.id===screen),code=explicit?.code??screen,meta=DETAIL_SCREENS.find(s=>s.code===code&&s.mobile===mobile)??explicit??DETAIL_SCREENS.find(s=>s.code===code)??DETAIL_SCREENS[0],Body=detailMarkup[meta.id];
 const variantIndex=Number(new URLSearchParams(location.search).get('variant')??-1),variant=DETAIL_VARIANTS.find(v=>v.code===code&&v.index===variantIndex&&v.mobile===mobile),Variant=variant?detailVariantMarkup[variant.id]:null;
 const task=DETAIL_TASKS.find(item=>item.id===meta.id),TaskBody=task?taskBodyMarkup[task.id]:null,TaskActions=task?taskActionMarkup[task.id]:null;
 const closeTask=()=>{const parent:Record<string,string>={M02:'M01',M04:'M03',A04:'A03',E01:'E02'};let target=parent[code]?`/nchive?screen=${parent[code]}&locale=${locale}`:code==='A05'?'/nchive?view=members':code==='R01'?'/my/friends':'/nchive';const saved=sessionStorage.getItem('pencil-task-return');if(saved){try{const parsed=JSON.parse(saved) as {path:string;task?:string};const url=new URL(parsed.path,location.origin);if(parsed.task===code&&url.origin===location.origin&&url.href!==location.href)target=url.pathname+url.search;}catch{/* Ignore a stale local return location. */}}dirtyRef.current=false;setDirty(false);router.push(target);};
 const requestClose=()=>{if(exitPrompt){setExitPrompt(false);return;}if(dirty)setExitPrompt(true);else closeTask();};
 useEffect(()=>{if(!dirty||!task)return;const prevent=(event:BeforeUnloadEvent)=>{if(!dirtyRef.current)return;event.preventDefault();event.returnValue='';};const discardOnLeave=()=>{if(dirtyRef.current)for(const key of Object.keys(sessionStorage))if(key.startsWith(`pencil-draft:${code}:`))sessionStorage.removeItem(key);};window.addEventListener('beforeunload',prevent);window.addEventListener('pagehide',discardOnLeave);return()=>{window.removeEventListener('beforeunload',prevent);window.removeEventListener('pagehide',discardOnLeave);};},[dirty,task,code]);
 useEffect(()=>{if(task)return;const saved=sessionStorage.getItem('pencil-task-return');if(!saved)return;try{const parsed=JSON.parse(saved) as {path:string;label:string;scroll?:number};if(parsed.path===location.pathname+location.search&&parsed.label)requestAnimationFrame(()=>{document.querySelector<HTMLElement>(`[aria-label="${CSS.escape(parsed.label)}"]`)?.focus({preventScroll:true});window.scrollTo(0,parsed.scroll??0);});}catch{/* An absent opener leaves normal page focus. */}},[task]);
 const navigate=(next:string)=>{sessionStorage.setItem('pencil-task-return',JSON.stringify({task:next,scroll:window.scrollY,path:location.pathname+location.search,label:document.activeElement?.getAttribute('aria-label')??''}));dirtyRef.current=false;setDirty(false);router.push(`/nchive?screen=${next}&locale=${locale}`);};
 const act=async(label:string,element:HTMLButtonElement)=>{
  setMessage('');
  if(task&&['취소','작업 취소','작업 닫기','닫기'].includes(label)){requestClose();return;}
  if(/사진.*선택|사진 교체|사진 추가|영상 추가|이미지 선택|자료 선택|자료 첨부|사진 첨부|사진·영상 첨부/.test(label)){file.current?.click();return;}
  if(/복사/.test(label)){try{await navigator.clipboard.writeText(`${location.origin}/nchive?screen=R05`);setMessage('초대 링크를 복사했어요.');}catch{setMessage('복사하지 못했어요. 다시 시도해 주세요.');}return;}
  const links:Record<string,string>={'사진 교체':'M04','인증 제출하기':'M02','내 제출 내역':'M03','제출 내역 보기':'M03','다시 제출하기':'M04','보완하기':'M04','내용 보완하기':'M04','적립 내역 보기':'M06','모임 적립 내역 확인':'M06','적립 내역 확인':'M06','참여 내역 보기':'M06','초대 내역 보기':'R02','알림 설정':'R04','게시글 보기':'B02','글 작성':'B03','일정 수정':'A01','선물 등록 신청':'A06','신청 내역 보기':'A07','정산 내역 보기':'A09','후기 작성':'E01','후기 보기':'E02','적립 내역으로':'M06','친구 초대하기':'R01','후기 수정':'E01','신청 내용 보완':'A06','자료 보완':'A04','운영자 자격 확인':'A03'};
  if(links[label]){navigate(links[label]);return;}
  if(label==='첨부 삭제'){setPhoto('');return;}
  if(label==='회원·랭킹'){router.push('/nchive?view=members');return;}
  if(label==='페이지 메뉴'){router.push('/nchive?screen=R04');return;}
  if(label==='추첨 개설로 이동'){router.push('/?view=manage&section=raffles');return;}
  if(label==='이 회원 프로필'||label==='프로필·친구 요청'){router.push('/my/profile?profileView=peer');return;}
  if(label==='받은 친구 요청'){router.push('/my/friends?state=incoming');return;}
  if(label==='친구 목록'){router.push('/my/friends');return;}
  if(/카메라|스캔/.test(label)){router.push('/my/profile?profileView=scan');return;}
  if(label==='모임 소개 보기'){router.push('/nchive');return;}
  if(label==='초대 거절'){setMessage('초대를 거절했어요.');return;}
  if(label==='좋아요'){element.setAttribute('aria-pressed',String(element.getAttribute('aria-pressed')!=='true'));setMessage(element.getAttribute('aria-pressed')==='true'?'좋아요를 눌렀어요.':'좋아요를 취소했어요.');return;}
  if(/QR|친구 추가/.test(label)){router.push('/my/profile?profileView=profile');return;}
  if(label==='일정 취소 확인'){const reason=form.current?.querySelector<HTMLInputElement|HTMLTextAreaElement>('[aria-label="취소 사유"]');if(!reason?.value.trim()){setMessage('취소 사유를 입력해 주세요.');reason?.focus();return;}sessionStorage.setItem('pencil-result:A02','cancelled');setMessage('일정을 취소했어요.');return;}
  if(/목록|돌아가기|취소/.test(label)){router.push('/nchive?tab=calendar');return;}
  if(/제출|저장|신청|등록|동의|확인|공개/.test(label)){
   if(!form.current?.reportValidity())return;
   if(['M02','M04','E01'].includes(code)&&(!photo||!form.current.querySelector<HTMLInputElement>('input:not([type=checkbox]):not([type=file]),textarea')?.value.trim())){setMessage('설명과 사진을 확인해 주세요.');return;}
   if(['M02','M04','M05','R05'].includes(code)&&!form.current.querySelector<HTMLInputElement>('input[type=checkbox]:checked')){setMessage('참여 항목을 확인해 주세요.');return;}
   sessionStorage.setItem(`pencil-result:${code}`,'saved');
   const next:Record<string,string>={M02:'M03',M04:'M03',M05:'M07',A01:'A02',A03:'A04',A06:'A07',A08:'A09',E01:'E02',R05:'M01'};
   if(next[code]){navigate(next[code]);return;}
   dirtyRef.current=false;setDirty(false);if(task&&code==='R04'){closeTask();return;}setMessage('저장했어요.');element.focus();return;
  }
  if(/요청|참여|보내기/.test(label)){const next:Record<string,string>={A03:'A04',A06:'A07',A08:'A09'};if(next[code]){navigate(next[code]);return;}setMessage(label.includes('메시지')?'메시지를 보냈어요.':'요청했어요.');return;}
  if(/다시/.test(label)){setMessage('다시 확인했어요.');return;}
  if(label==='대화별 차단'){element.setAttribute('aria-pressed','true');setMessage('이 대화를 차단했어요.');return;}
  if(label==='취소 상세 보기'){setMessage('취소된 적립 내역입니다. 지급 상태와 사유를 확인해 주세요.');return;}
 };
 const feedback=<>{Variant&&<div className='pencilDetailVariant' data-variant-root={variant?.rootId}><Variant/></div>}{photo&&<p className='pencilDetailFeedback' role='status'>{photo}</p>}{message&&<p className='pencilDetailFeedback' role='status'>{message}</p>}<input ref={file} type='file' accept='image/*' hidden onChange={e=>{const selected=e.target.files?.[0];if(selected&&!selected.type.startsWith('image/')){setMessage('사진 파일을 선택해 주세요.');return;}setPhoto(selected?.name??'');setDirty(true);}}/></>;
 return <div className='pencilDetailPreview' data-detail-screen={meta.id} data-detail-code={code} data-detail-variant={variantIndex>=0?variantIndex:undefined}><DetailContext.Provider value={{code,act:(label,el)=>void act(label,el)}}>{task&&TaskBody&&TaskActions?<>{(taskBackgrounds as Record<string,string>)[task.id]&&<div className='pencilTaskBackground' inert aria-hidden='true' dangerouslySetInnerHTML={{__html:(taskBackgrounds as Record<string,string>)[task.id]??''}}/>}<SourceTaskPanel key={task.id} nodeId={task.id} title={exitPrompt?'작성을 그만둘까요?':task.title} width={exitPrompt?560:task.width} mode={task.mode} onClose={requestClose} className='pencilDetailTask' actions={exitPrompt?<SourceTaskActions><FanAction variant='neutral' onClick={()=>setExitPrompt(false)}>계속 작성</FanAction><FanAction variant='primary' onClick={()=>{for(const key of Object.keys(sessionStorage))if(key.startsWith(`pencil-draft:${code}:`))sessionStorage.removeItem(key);closeTask();}}>나가기</FanAction></SourceTaskActions>:<TaskActions/>}>{exitPrompt?<div className='pencilTaskExit'><p>나가면 작성한 내용과 첨부가 사라져요.</p></div>:<form ref={form} onChangeCapture={()=>setDirty(true)} onSubmit={e=>e.preventDefault()}><TaskBody/>{feedback}</form>}</SourceTaskPanel></>:<><FanAppHeader locale={locale} currentPath='/pages/groups' groupsEnabled/>{meta.identity&&<div className={'pencilDetailIdentity '+groupStyles.page+' '+groupStyles.creatorPage}><CreatorGroupHeader celebrity={pencilArtistCreator(locale)} locale={locale} tab='home'/></div>}<form ref={form} onSubmit={e=>e.preventDefault()}><Body/>{feedback}</form></>}</DetailContext.Provider></div>;
}
