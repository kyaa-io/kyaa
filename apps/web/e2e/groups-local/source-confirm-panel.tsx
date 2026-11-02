import {useState} from 'react';
import {SourceTaskPanel,SourceTaskActions} from './source-task-panel';
import './source-confirm-panel.css';
const specs={
 G0fL7:{title:'게시글을 삭제할까요?',body:'가장 좋아하는 무대가 궁금해요',cancel:'돌아가기',confirm:'삭제하기',kind:'danger'},
 BCMPW:{title:'작성을 그만둘까요?',body:'나가면 작성한 내용과 첨부가 사라져요.',cancel:'계속 작성',confirm:'나가기',kind:'leave'},
 qUpqC:{title:'응모권 10장을 사용할까요?',cancel:'돌아가기',confirm:'10장으로 응모하기',kind:'primary'},
 PRK1L:{title:'추첨을 개설할까요?',body:'개설 후 응모 방식·최대 장수는 변경할 수 없어요.',cancel:'설정 수정',confirm:'개설하기',kind:'primary'},
 O2tSZ:{title:'역할 변경 확인',body:'하늘을 운영진으로 지정할까요?',cancel:'취소',confirm:'운영진 지정',kind:'compactPrimary'},
 A2n0y:{title:'소유권 이관 확인',body:'소유권을 넘기면 내 역할은 회원으로 바뀌어요.',cancel:'취소',confirm:'소유권 넘기기',kind:'compactDanger'},
 N9TgPu:{title:'모임 나가기',body:'모임을 나가면 멤버용 글과 활동을 이용할 수 없어요.',cancel:'취소',confirm:'모임 나가기',kind:'compactDanger'},
 jn589:{title:'참가 신청',cancel:'취소',confirm:'신청하기',kind:'primary'},
} as const;
const aliases={fNe6I:'G0fL7',RS2uz:'BCMPW',HbVi5:'qUpqC',x3FJF:'PRK1L',IVPEq:'O2tSZ',g6zYRZ:'A2n0y',Neylr:'N9TgPu',n0s8Gm:'jn589'} as const;
export const SOURCE_CONFIRM_PANELS={...specs,...Object.fromEntries(Object.entries(aliases).map(([id,key])=>[id,specs[key]]))};
export type SourceConfirmPanelProps={nodeId:string;onClose:()=>void;onConfirm?:(values:Record<string,string>)=>void|Promise<void>};
export function SourceConfirmPanel({nodeId,onClose,onConfirm}:SourceConfirmPanelProps){
 const key=(aliases[nodeId as keyof typeof aliases]??nodeId) as keyof typeof specs,spec=specs[key];
 const [owner,setOwner]=useState('하늘'),[participant,setParticipant]=useState('하늘'),[message,setMessage]=useState('');
 if(!spec)return null;
 const compact=spec.kind.startsWith('compact');
 return <SourceTaskPanel nodeId={nodeId} title={spec.title} className={`sourceConfirmPanel sourceConfirm-${key}`} onClose={onClose} actions={<SourceTaskActions className={compact?'sourceConfirmCompact':''}><button type='button' className={spec.kind==='leave'?'sourceConfirmPrimary':'sourceConfirmNeutral'} onClick={onClose}>{spec.cancel}</button><button type='button' className={`sourceConfirm${spec.kind==='leave'?'Neutral':spec.kind.includes('Danger')||spec.kind==='danger'?'Danger':'Primary'}${compact?' sourceConfirmSmall':''}`} onClick={()=>{if(onConfirm)void Promise.resolve(onConfirm({owner,participant,message})).catch(()=>{});else onClose();}}>{spec.confirm}</button></SourceTaskActions>}>
 <div className='sourceConfirmBody'>
 {key==='A2n0y'&&<label>새 소유자<input value={owner} onChange={event=>setOwner(event.target.value)}/></label>}
 {'body'in spec&&<p>{spec.body}</p>}
 {key==='qUpqC'&&<><strong>엔카이브 굿즈 추첨</strong><p>보유 응모권 12장 → 2장<br/>내 응모 수량 30장 → 40장</p><p>사용한 응모권은 취소·회수할 수 없어요.<br/>낙첨 시에는 반환되지 않으며, 주최 측이 취소한 경우에만 자동 반환돼요.</p></>}
 {key==='PRK1L'&&<dl className='sourceConfirmSummary'>{[['경품 이름','엔카이브 굿즈'],['당첨 인원','5명'],['응모 마감','2026. 11. 7. 18:00'],['발표 후 제출 기한','7일'],['응모 방식','여러 장'],['1인 최대 응모권','100장']].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>}
 {key==='jn589'&&<div className='sourceConfirmFields'><label>참가자<input value={participant} onChange={event=>setParticipant(event.target.value)}/></label><label>주최자에게 전할 말 · 선택<input value={message} onChange={event=>setMessage(event.target.value)}/></label></div>}
 </div></SourceTaskPanel>;
}
