import {BenefitsSupport,BenefitsCatalog,BenefitsExchangeShop} from '@/features/groups/ui/group-benefits-screen';
import {useEffect,useState,type MouseEvent} from 'react';
import {ChevronRight,Minus,Plus,RefreshCw} from 'lucide-react';
import {FanAppHeader,FanAppBottomNavigation} from '@/components/fan-shell/fan-app-shell';
import {FanAction} from '@/components/fan-ui/fan-action';
import {walletSchema} from '@/server/group-wallet/domain';
import {walletCopy} from '@/features/group-wallet/ui/copy';
import {useByUsSession} from '@/components/byus-session-provider';
import {useByUsAuth} from '@/features/auth/client/cognito-auth';
import type {AppLocale} from '@/i18n/locales';
import './pencil-benefits-preview.css';
import {SourceTaskPanel,SourceTaskActions} from './source-task-panel';
export const PENCIL_BENEFITS_IDS=['sX58m','ajFsZ','v32uWj','fekJf','OMn1B','XKjmZ'] as const;
export type PencilBenefitsNodeId=typeof PENCIL_BENEFITS_IDS[number];
export type PencilBenefitsPreviewProps={locale:AppLocale;nodeId?:PencilBenefitsNodeId;onClose?:()=>void;onRetry?:()=>void;onNavigate?:(href:string)=>void};
const ticketStates=['v32uWj','OMn1B'],heartStates=['fekJf','XKjmZ'];
function usePreviewWallet(disabled:boolean){
 const session=useByUsSession(),auth=useByUsAuth(),key=session.ready&&auth.ready&&auth.authenticated&&session.ownerId?`${session.ownerId}:${session.generation}`:null;
 const [attempt,setAttempt]=useState(0),[lookup,setLookup]=useState<{key:string|null;state:'loading'|'ready'|'error';wallet?:ReturnType<typeof walletSchema.parse>}>({key:null,state:'loading'});
 useEffect(()=>{if(disabled||!key)return;const controller=new AbortController();setLookup(current=>current.key===key&&current.state==='ready'?current:{key,state:'loading'});void fetch('/api/me/wallet',{signal:controller.signal}).then(async response=>{if(!response.ok)throw new Error('WALLET_LOOKUP_FAILED');return walletSchema.parse(await response.json());}).then(wallet=>{if(!controller.signal.aborted)setLookup({key,state:'ready',wallet});}).catch(()=>{if(!controller.signal.aborted)setLookup({key,state:'error'});});return()=>controller.abort();},[disabled,key,attempt]);
 useEffect(()=>{const refresh=()=>setAttempt(current=>current+1);window.addEventListener('kyaa:group-wallet-changed',refresh);return()=>window.removeEventListener('kyaa:group-wallet-changed',refresh);},[]);
 const state=disabled?'error':!auth.ready||!session.ready?'loading':!key?'guest':lookup.key!==key?'loading':lookup.state;
 return {state,wallet:state==='ready'?lookup.wallet:undefined,retry:()=>setAttempt(current=>current+1)};
}
/** Local preview reads the same wallet endpoint as support; never performs exchange writes. */
export function PencilBenefitsPreview({locale,nodeId='sX58m',onClose,onRetry,onNavigate}:PencilBenefitsPreviewProps){
 const deliberate=ticketStates.includes(nodeId)||heartStates.includes(nodeId),summary=usePreviewWallet(deliberate),wallet=summary.wallet;
 const [conversion,setConversion]=useState<'ticket'|'heart'|null>(ticketStates.includes(nodeId)?'ticket':heartStates.includes(nodeId)?'heart':null),session=useByUsSession();
 useEffect(()=>setConversion(ticketStates.includes(nodeId)?'ticket':heartStates.includes(nodeId)?'heart':null),[nodeId]);
 const link=(href:string)=>onNavigate?{onClick:(event:MouseEvent)=>{event.preventDefault();onNavigate(href);}}:{};
 return <div className='pencilBenefitsPreview' data-fan-surface lang={locale} data-source-node={nodeId}><FanAppHeader locale={locale} currentPath='/benefits' groupsEnabled/>
 <main className='pencilBenefitsMain'><header className='pencilBenefitsHeading'><h1>덕질</h1><a href='/?view=history' {...link('/?view=history')}>참여 내역</a></header>
 <section className='pencilBenefitsWalletSection' aria-label={walletCopy(locale).wallet}><h2>{walletCopy(locale).wallet}</h2><div className='pencilBenefitsBalances'><div className='pencilBenefitsPoints'><span>내 포인트</span><strong>{deliberate?'— P':wallet?`${wallet.points.toLocaleString(locale)} P`:'— P'}</strong><a href='/my/wallet?section=history' {...link('/my/wallet?section=history')}>적립·사용 내역</a></div><div className='pencilBenefitsAssets'>{(['ticket','heart'] as const).map(kind=><div key={kind}><img className='pencilBenefitsAssetIcon' src={`/images/economy/${kind}.svg`} alt='' width={48} height={48}/><span>{kind==='ticket'?'모임 응모권':'하트'}</span><strong>{deliberate?'—':wallet?`${(kind==='ticket'?wallet.tickets:wallet.hearts).toLocaleString(locale)}${kind==='ticket'?'장':'개'}`:'—'}</strong><small className='pencilBenefitsExchangeRate'>{wallet?`${wallet.pointCost.toLocaleString(locale)} P = ${kind==='ticket'?'1장':'1개'}`:'—'}{kind==='ticket'&&<span className='pencilBenefitsOfficialUnknown'>Kyaa 공식 응모권 —</span>}</small></div>)}</div></div>{!deliberate&&summary.state==='loading'&&<p role='status'>{walletCopy(locale).loading}</p>}{!deliberate&&summary.state==='guest'&&<FanAction href={`/login?locale=${locale}&returnTo=${encodeURIComponent(`/benefits?locale=${locale}`)}`}>{walletCopy(locale).login}</FanAction>}{!deliberate&&summary.state==='error'&&<div role='alert'><p>{walletCopy(locale).error}</p><FanAction onClick={summary.retry}>{walletCopy(locale).retry}</FanAction></div>}</section>
 <BenefitsExchangeShop locale={locale} onHeart={()=>setConversion('heart')}/>
 <BenefitsSupport locale={locale}/>
 <section className='pencilBenefitsParticipation'><h2>럭키드로우</h2><BenefitsCatalog kind='raffles' locale={locale}/></section>
 <a className='pencilBenefitsMobileHistory' href='/my/wallet?section=history' {...link('/my/wallet?section=history')}>모임 응모권 · 적립·사용 내역</a></main><FanAppBottomNavigation locale={locale} currentPath='/benefits' groupsEnabled/>
 {conversion&&<BenefitsConversion key={`${conversion}:${session.ownerId}:${session.generation}`} locale={locale} kind={conversion} nodeId={nodeId} onClose={()=>{setConversion(null);onClose?.();}} onRetry={onRetry}/>}</div>;
}
function BenefitsConversion({locale,kind,nodeId,onClose,onRetry}:{locale:AppLocale;kind:'ticket'|'heart';nodeId:PencilBenefitsNodeId;onClose:()=>void;onRetry?:()=>void}){
 const [quantity,setQuantity]=useState('10'),[maximum,setMaximum]=useState(false),[manual,setManual]=useState('10'),ticket=kind==='ticket',title=ticket?'응모권 전환':'하트 전환';
 const deliberate=ticketStates.includes(nodeId)||heartStates.includes(nodeId),lookup=usePreviewWallet(deliberate);
 const wallet=lookup.state==='ready'?lookup.wallet:undefined,limit=wallet&&!ticket&&Number.isSafeInteger(wallet.points)&&wallet.points>=0&&Number.isSafeInteger(wallet.pointCost)&&wallet.pointCost>0?Math.min(1000,Math.floor(wallet.points/wallet.pointCost)):0,value=maximum&&limit>0?limit:Number(quantity),valid=Number.isSafeInteger(value)&&value>=1&&value<=1000,cost=wallet&&valid&&!ticket&&Number.isSafeInteger(value*wallet.pointCost)?value*wallet.pointCost:null;
 useEffect(()=>{if(lookup.state==='error'||lookup.state==='guest'||(lookup.state==='ready'&&limit===0))setMaximum(false);},[lookup.state,limit]);
 const change=(next:string)=>{setMaximum(false);setQuantity(next);const parsed=Number(next);if(Number.isSafeInteger(parsed)&&parsed>=1&&parsed<=1000)setManual(next);};
 const calculations=[['교환비율',wallet&&!ticket?`${wallet.pointCost.toLocaleString(locale)} P = 1개`:'확인 필요'],['필요 포인트',cost!==null?`${cost.toLocaleString(locale)} P`:'— P'],['전환 후 포인트',wallet&&cost!==null&&cost<=wallet.points?`${(wallet.points-cost).toLocaleString(locale)} P`:'— P']];

 return <SourceTaskPanel className='pencilBenefitsTask' nodeId={ticket?ticketStates.includes(nodeId)?nodeId:'v32uWj':heartStates.includes(nodeId)?nodeId:'fekJf'} title={title} onClose={onClose} actions={<SourceTaskActions><FanAction variant='primary' className='pencilBenefitsRetry' trailingIcon={<RefreshCw size={18}/>} disabled={lookup.state==='loading'} onClick={()=>{onRetry?.();if(!deliberate)lookup.retry();}}>다시 확인하기</FanAction></SourceTaskActions>}><div className='pencilBenefitsConversion'><div className='pencilBenefitsAvailable'><span>사용 가능한 포인트</span><strong>{wallet?`${wallet.points.toLocaleString(locale)} P`:'— P'}</strong></div>
 {ticket&&<><span>받을 응모권</span><strong>Kyaa 공식 응모권</strong></>}
 <div className='pencilBenefitsQuantityRow'><label className='pencilBenefitsQuantityLabel' htmlFor='pencil-benefits-quantity'>얼마나 전환할까요?</label><label className='pencilBenefitsMaximum'><input type='checkbox' checked={maximum&&limit>0} disabled={!limit} onChange={event=>{if(event.target.checked){setMaximum(true);}else{setMaximum(false);setQuantity(String(Math.min(Math.max(Number(manual)||1,1),limit||1)));}}}/>{locale==='ko'?'최대 교환':'Maximum exchange'}</label></div><div className='pencilBenefitsStepper'><button type='button' aria-label='전환 수량 줄이기' disabled={!valid||value<=1} onClick={()=>change(String(value-1))}><Minus size={20}/></button><span><input id='pencil-benefits-quantity' aria-label='전환 수량' type='number' min={1} step={1} value={maximum&&limit>0?String(limit):quantity} onChange={event=>change(event.target.value)}/><span>{ticket?'장':'개'}</span></span><button type='button' aria-label='전환 수량 늘리기' disabled={!valid||value>=1000} onClick={()=>change(String(value+1))}><Plus size={20}/></button></div>
 <dl className='pencilBenefitsCalculation'>{calculations.map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>{lookup.state==='loading'&&<p role='status'>{walletCopy(locale).loading}</p>}{lookup.state==='guest'&&<p>{walletCopy(locale).login}</p>}{lookup.state==='error'&&<div className='pencilBenefitsLookupError' role='status'><p>전환 정보를 불러오지 못했어요.</p><small>포인트는 차감되지 않았어요. 다시 확인해 주세요.</small></div>}<p className='pencilBenefitsConversionHint'>{locale==='ko'?'전환 정보만 확인할 수 있어요.':'Exchange information is read-only.'}</p></div></SourceTaskPanel>;
}
