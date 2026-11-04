import {useRef,useState} from 'react';
import {Play,X,ImagePlus} from 'lucide-react';
import {ContentActions} from '../../features/content-safety/ui/content-actions';
import type {BoardDetailPreview} from './pencil-post-detail';
import './pencil-post-preview.css';
const board='/nchive?tab=board',postId='e9800000-0000-4000-8000-000000000001';
function CommentMedia({video=false}:{video?:boolean}){
 const ref=useRef<HTMLDialogElement>(null),src=video?'/images/groups/source-community/video-example-poster.png':'/images/groups/nchive-group.webp';
 return <div className='pencilCommentMedia' data-video={video}><button type='button' aria-label={video?'첨부 영상 보기':'첨부 사진 전체 보기'} onClick={()=>ref.current?.showModal()}><img src={src} alt=''/>{video&&<Play aria-hidden/>}</button><dialog ref={ref} aria-label={video?'첨부 영상':'첨부 사진'}><button type='button' aria-label='닫기' onClick={()=>ref.current?.close()}><X/></button><img src={src} alt={video?'첨부 영상 미리보기':'첨부 사진'}/></dialog></div>;
}
// harness-only: 제품 댓글에는 사진·영상 첨부가 없다(원본 Pencil 시안 미리보기). 기본 화면에는 내지 않고 ?commentAttachment=1일 때만 보인다.
// shortcut: attachment selection is a local visual preview until comment-media uploads exist.
function CommentAttachment(){const [name,setName]=useState('');return <label className='pencilCommentAttachment'><ImagePlus size={20}/><span>{name||'사진·영상'}</span><input type='file' accept='image/*,video/*' aria-label='댓글 사진·영상 선택' onChange={e=>setName(e.target.files?.[0]?.name??'')}/></label>;}
export function pencilPostPreview():BoardDetailPreview{return {
 backLabel:'목록으로',likeLabel:'좋아요',commentLabel:'댓글 남기기',commentPlaceholder:'댓글을 입력해 주세요.',commentTools:typeof location!=='undefined'&&new URLSearchParams(location.search).get('commentAttachment')==='1'?<CommentAttachment/>:undefined,commentTimes:{'e9900000-0000-4000-8000-000000000010':'30분 전','e9900000-0000-4000-8000-000000000011':'20분 전'},
 heading:<header className='pencilPostHeading'><span>자유게시판</span><div><h1>가장 좋아하는 무대가 궁금해요</h1><span>HIT</span></div></header>,
 metadata:<div className='pencilPostMetadata'><img src='/images/avatars/heart-pink.webp' alt='' width={36} height={36}/><strong>팬 B</strong><time dateTime='2026-10-29T04:00:00Z'>2026.10.29 13:00</time><span>조회 54</span><ContentActions directReport targetType='fan_post' targetId={postId} locale='ko' onChanged={()=>{}}/></div>,
 commentMedia:{'e9900000-0000-4000-8000-000000000010':<CommentMedia/>,'e9900000-0000-4000-8000-000000000011':<CommentMedia video/>},
 afterComments:<section className='pencilPostRelated'><header><h2>다른 글</h2><a href={board}>전체 보기 →</a></header>{[['오늘 같이 본 영상 이야기해요','3','팬 A'],['오늘 함께한 순간을 남겨요','2','엔카이브'],['다음에 같이 보고 싶은 콘텐츠','0','팬 D']].map(([title,count,author],i)=><a key={title} href={`/c/nchive/community/e9800000-0000-4000-8000-${String(i+2).padStart(12,'0')}`}><span>{title} <small>({count})</small></span><span>{author}</span></a>)}<footer><a href={board}>목록으로</a><a href='/nchive'>팬모임 홈</a></footer></section>
};}
