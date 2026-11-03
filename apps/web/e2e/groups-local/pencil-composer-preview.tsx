import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { ChevronDown, ImagePlus, Play, X } from 'lucide-react';
import type { AppLocale } from '@/i18n/locales';
import type { PublishedCelebrity } from '@/server/content/content-domain';
import { GroupShell } from '@/features/groups/ui/group-shell';
import { CreatorGroupHeader } from '@/features/groups/ui/creator-group-header';
import { CreatorBoardAside } from '@/features/groups/ui/creator-board-aside';
import { FanSiteFooter } from '@/components/fan-shell/fan-site-footer';
import { FanAction } from '@/components/fan-ui/fan-action';
import { contentCopy } from '@/i18n/catalogs/features__fan_posts__ui';
import './pencil-composer-preview.css';

export type PencilComposerAttachment = { id: string; kind: 'image' | 'video'; url: string; file?: File };
export type PencilComposerDraft = { title: string; body: string; visibility: 'public' | 'members'; attachments: PencilComposerAttachment[] };
export type PencilComposerPreviewProps = { locale: AppLocale; celebrity: PublishedCelebrity; nodeId: 'Urthu' | 'wCL5S'; onClose: () => void; onSubmit?: (draft: PencilComposerDraft) => void | Promise<void> };
export const PENCIL_COMPOSER_DEFAULTS = {
 title: '가장 좋아하는 무대가 궁금해요',
 // Include a final line ending to match the source's initial 94-character counter.
 body: '요즘 예전 무대들을 하나씩 다시 보고 있어요. 같은 곡도 무대마다 분위기가 달라서 새로운 장면이 보이더라고요. 여러분이 가장 좋아하는 엔카이브 무대는 어떤 무대인가요?\n',
};
const eventId='e9200000-0000-4000-8000-000000000001';
/** Local file previews only; this composer never calls the WAVE-only upload APIs. */
export function PencilComposerPreview({ locale, celebrity, nodeId, onClose, onSubmit }: PencilComposerPreviewProps) {
 const copy=contentCopy(locale), picker=useRef<HTMLInputElement>(null), ownedUrls=useRef(new Set<string>()), running=useRef(false);
 const [title,setTitle]=useState(PENCIL_COMPOSER_DEFAULTS.title),[body,setBody]=useState(PENCIL_COMPOSER_DEFAULTS.body),[visibility,setVisibility]=useState<'public'|'members'>('public');
 const [attachments,setAttachments]=useState<PencilComposerAttachment[]>(()=>nodeId==='wCL5S'?[{id:'source-video',kind:'video',url:'/images/groups/source-community/video-example-poster.png'}]:[{id:'source-photo-1',kind:'image',url:'/images/groups/nchive-group.webp'},{id:'source-photo-2',kind:'image',url:'/images/groups/source-community/51f39b3be29d92d4.jpg'}]);
 const [problem,setProblem]=useState(''),[busy,setBusy]=useState(false);
 useEffect(()=>{const urls=ownedUrls.current;return()=>{urls.forEach(url=>URL.revokeObjectURL(url));urls.clear();};},[]);
 function remove(id:string){const item=attachments.find(asset=>asset.id===id);if(item&&ownedUrls.current.delete(item.url))URL.revokeObjectURL(item.url);setAttachments(items=>items.filter(asset=>asset.id!==id));setProblem('');}
 function choose(event:ChangeEvent<HTMLInputElement>){
  const files=Array.from(event.currentTarget.files??[]);event.currentTarget.value='';if(!files.length)return;
  if(files.some(file=>!file.size||(!file.type.startsWith('image/')&&!file.type.startsWith('video/')))){setProblem('사진 또는 영상 파일을 선택해 주세요.');return;}
  const kinds=[...attachments.map(asset=>asset.kind),...files.map(file=>file.type.startsWith('video/')?'video':'image')];
  if(new Set(kinds).size>1||kinds.filter(kind=>kind==='video').length>1||kinds.filter(kind=>kind==='image').length>10){setProblem('사진 최대 10장 또는 영상 1개');return;}
  const added:PencilComposerAttachment[]=[];
  try{for(const file of files){const url=URL.createObjectURL(file);ownedUrls.current.add(url);added.push({id:crypto.randomUUID(),kind:file.type.startsWith('video/')?'video':'image',url,file});}setAttachments(items=>[...items,...added]);setProblem('');}
  catch{added.forEach(asset=>{URL.revokeObjectURL(asset.url);ownedUrls.current.delete(asset.url);});setProblem('첨부 미리보기를 만들지 못했어요. 다시 선택해 주세요.');}
 }
 async function submit(event:FormEvent){event.preventDefault();if(running.current||!title.trim()||body.length>5000)return;running.current=true;setBusy(true);setProblem('');
  try{await onSubmit?.({title,body,visibility,attachments:[...attachments]});onClose();}
  catch{setProblem('작성한 내용과 첨부는 그대로예요. 다시 시도해 주세요.');}
  finally{running.current=false;setBusy(false);}
 }
 const video=attachments[0]?.kind==='video';
 return <div className="pencilComposerPreview" data-source-node={nodeId}><GroupShell locale={locale}><CreatorGroupHeader celebrity={celebrity} locale={locale} tab="board"/>
  <div className="pencilComposerLayout"><section className="pencilComposerMain">
   <button className="pencilComposerBack" type="button" disabled={busy} onClick={onClose}>← 게시판으로</button>
   <header className="pencilComposerHeading"><h2>글쓰기</h2><span><img src="/images/groups/source-community/1d6fe45b853f0134.webp" width={28} height={28} alt=""/><strong>팬 B</strong></span></header>
   <p className="pencilComposerContext">{celebrity.name} · 자유게시판</p>
   <form className="pencilComposerForm" onSubmit={event=>void submit(event)}>
    <label className="pencilComposerTitle"><span>제목 필수</span><input value={title} required maxLength={5000} disabled={busy} onChange={event=>setTitle(event.target.value)}/></label>
    <section className="pencilComposerBody"><label htmlFor="pencil-composer-body">내용</label><div className="pencilComposerEditor">
     <textarea id="pencil-composer-body" value={body} maxLength={5000} disabled={busy} onChange={event=>setBody(event.target.value)} placeholder="팬들과 나누고 싶은 이야기를 적어주세요."/>
     {attachments.length>0&&<div className="pencilComposerAttachments"><p>{video?'영상':'사진'} {attachments.length} / {video?1:10}</p><ul>{attachments.map((asset,index)=><li key={asset.id} data-kind={asset.kind}>{asset.kind==='video'&&asset.file?<video controls preload="metadata" src={asset.url} aria-label="첨부 영상"/>:<><img src={asset.url} alt={asset.kind==='video'?'첨부 영상':`첨부 사진 ${index+1}`}/>{asset.kind==='video'&&<span className="pencilComposerPlay" aria-hidden="true"><Play size={16} fill="currentColor"/></span>}</>}<button type="button" disabled={busy} aria-label={asset.kind==='video'?'영상 삭제':`사진 ${index+1} 삭제`} onClick={()=>remove(asset.id)}><X size={18} aria-hidden="true"/></button></li>)}</ul></div>}
     <div className="pencilComposerTools"><FanAction type="button" disabled={busy} leadingIcon={<ImagePlus size={18}/>} onClick={()=>picker.current?.click()}>사진·영상 첨부</FanAction><span aria-live="polite">{body.length.toLocaleString(locale)} / 5,000</span><input ref={picker} className="pencilComposerFileInput" type="file" accept="image/*,video/*" multiple tabIndex={-1} disabled={busy} aria-label="사진·영상 파일 선택" onChange={choose}/></div>
    </div><p className="pencilComposerHint">사진 최대 10장 또는 영상 1개</p></section>
    <div className="pencilComposerActions"><label>공개 범위<span><select value={visibility} disabled={busy} onChange={event=>setVisibility(event.target.value as 'public'|'members')}><option value="public">{copy.public}</option><option value="members">{copy.members}</option></select><ChevronDown size={16} aria-hidden="true"/></span></label><FanAction type="button" disabled={busy} onClick={onClose}>취소</FanAction><FanAction variant="primary" type="submit" disabled={busy||!title.trim()||body.length>5000} ariaBusy={busy}>등록</FanAction></div>
    {problem&&<p className="pencilComposerProblem" role="alert">{problem}</p>}
   </form>
  </section><CreatorBoardAside slug={celebrity.slug} locale={locale} event={{title:'굿즈 추첨 이벤트',image:'/images/groups/nchive-prize-pencil.png',href:`/pages/groups/${eventId}/raffles/${eventId}?locale=${locale}`,exchangeHref:`/my/wallet?locale=${locale}`}}/></div>
 </GroupShell><FanSiteFooter locale={locale}/></div>;
}
