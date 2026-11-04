"use client";
import {WalletExchangeDialog,WalletSupportDialog} from '@/features/group-wallet/ui/wallet-screen';
import {Slider} from '@base-ui/react/slider';
import {useEffect,useRef,useState,type ReactNode} from 'react';
import Link from 'next/link';
import type {Route} from 'next';
import {z} from 'zod';
import {ArrowRight,Check,ChevronRight,Coins,Ticket} from 'lucide-react';
import {FanAppFrame,FanContentContainer} from '@/components/fan-shell/fan-app-shell';
import {FanAction} from '@/components/fan-ui/fan-action';
import {CreatorImage} from '@/components/fan-ui/creator-image';
import {type AppLocale,toContentLocale} from '@/i18n/locales';
import {groupBenefitsCatalogSchema,type GroupBenefitsCatalog} from '@/server/group-benefits/domain';
import {walletSchema} from '@/server/group-wallet/domain';
import {walletCopy,heartSupportCopy} from '@/features/group-wallet/ui/copy';
import {rewardedAdUnit} from '@/features/group-wallet/ui/google-rewarded-ad';
import {rewardedExchangeCopy} from '@/features/group-wallet/ui/rewarded-copy';
import {capsuleCopy} from '@/features/group-capsule/copy';
import {raffleCopy} from '@/features/group-raffle/copy';
import {GroupImage} from './group-image';
import {GROUP_WALLET_CHANGED_EVENT,useGroupRequest,useGroupResource} from './use-group-resource';
import {groupsCopy} from './copy';
import {groupBenefitsCopy,benefitsRaffleState} from './group-benefits-copy';
import styles from './group-benefits.module.css';
const parseWallet=(value:unknown)=>walletSchema.parse(value);
const singularTicket:Partial<Record<AppLocale,string>>={en:'Ticket',es:'Boleto',fr:'Billet',pt:'Bilhete',ru:'Билет'};
const ticketLabel=(locale:AppLocale)=>locale==='ko'?'모임 응모권':walletCopy(locale).tickets;
const parseRaffles=(value:unknown)=>groupBenefitsCatalogSchema.options[0].parse(value);
const creatorsSchema=z.object({celebrities:z.array(z.object({slug:z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),name:z.string(),image:z.object({url:z.string(),position:z.string()}).optional()}))});
const parseCreators=(value:unknown)=>creatorsSchema.parse(value);
export function GroupBenefitsScreen({locale}:{locale:AppLocale}){
 const auth=useGroupRequest(),c=groupBenefitsCopy(locale),w=walletCopy(locale);
 return <FanAppFrame locale={locale} currentPath='/benefits' groupsEnabled mainId='benefits-main'><FanContentContainer as='main' id='benefits-main' className={styles.page}>
 <header className={styles.heading}><h1>{c.title}</h1><FanAction variant='text' className={styles.linkChip} trailingIcon={<ChevronRight size={16}/>} href={`/my/wallet?locale=${locale}#wallet-history`}>{c.historyLink}</FanAction></header>
 <section className={styles.walletSection} aria-label={walletCopy(locale).wallet}><h2 className={styles.srOnly}>{walletCopy(locale).wallet}</h2><BenefitsWallet locale={locale}/></section>
 <BenefitsExchangeShop key={`${locale}:${auth.ownerKey}`} locale={locale}/>
 <BenefitsComingSoon locale={locale} grouped><BenefitsSupport key={`${locale}:${auth.ownerKey}`} locale={locale} locked/>
 <section className={styles.participation}><BenefitsCatalog key={`raffles:${auth.ownerKey}`} kind='raffles' locale={locale} heading={c.lucky}/></section></BenefitsComingSoon>

 </FanContentContainer></FanAppFrame>;
}
export function BenefitsExchangeShop({locale}:{locale:AppLocale}){
 const auth=useGroupRequest(),w=walletCopy(locale),wallet=useGroupResource(auth.authenticated?'/api/me/wallet':null,parseWallet),[open,setOpen]=useState(false);
 useEffect(()=>{window.addEventListener(GROUP_WALLET_CHANGED_EVENT,wallet.retry);return()=>window.removeEventListener(GROUP_WALLET_CHANGED_EVENT,wallet.retry);},[wallet.retry]);
 return <section className={styles.exchangeShop}><h2>{w.exchange}</h2>{!auth.ready||wallet.loading?<p role='status'>{w.loading}</p>:!auth.authenticated?<FanAction href={`/login?locale=${locale}&returnTo=${encodeURIComponent(`/benefits?locale=${locale}`)}`}>{w.login}</FanAction>:wallet.error||!wallet.data?null:<><fieldset className={styles.shopChoices}><legend>{w.exchange}</legend><label><input type='radio' name='exchange-target' checked readOnly/><img src='/images/economy/ticket.svg' alt='' width={64} height={64}/><span>{ticketLabel(locale)}</span><i className={styles.choiceCheck} aria-hidden='true'><Check size={14} strokeWidth={3}/></i></label><label data-soon=''><input type='radio' name='exchange-target' disabled/><img src='/images/economy/heart.svg' alt='' width={64} height={64}/><span>{w.hearts}</span></label></fieldset><div className={styles.shopFooter}><div className={styles.shopRate}><span>{wallet.data.pointCost.toLocaleString(locale)} P</span><ArrowRight size={20} aria-hidden/><span>{locale==='ko'?'1장':`1 ${singularTicket[locale]??w.tickets}`}</span></div><div className={styles.shopAction}>{rewardedAdUnit()?<FanAction variant='primary' disabled={wallet.data.points<wallet.data.pointCost} onClick={()=>setOpen(true)}>{rewardedExchangeCopy(locale).action}</FanAction>:<FanAction variant='primary' disabled helperText={rewardedExchangeCopy(locale).adOff}>{rewardedExchangeCopy(locale).action}</FanAction>}</div></div></>}<WalletExchangeDialog locale={locale} open={open} onClose={()=>setOpen(false)}/></section>;
}
/** Keeps a prepared 덕질 section visible but not usable until its operation is announced. */
export function BenefitsComingSoon({locale,children,grouped}:{locale:AppLocale;children:ReactNode;grouped?:boolean}){
 return <div className={grouped?`${styles.soon} ${styles.soonGroup}`:styles.soon}><div className={styles.soonContent} inert aria-hidden='true'>{children}</div><p className={styles.soonNotice}>{groupBenefitsCopy(locale).soon}</p></div>;
}
function BenefitsSkeleton({kind,label}:{kind:'wallet'|'event'|'support';label:string}){
 return <div role='status' aria-label={label} aria-busy='true' className={`${styles.loadingSkeleton} ${styles[`loading_${kind}`]}`}><div aria-hidden='true'>{(kind==='wallet'?[0,1,2]:kind==='event'?[0]:[0,1]).map(item=><div key={item}><i/><span><i/><i/></span></div>)}</div></div>;
}
/** Presentational summary shared by the real screen and the local preview. */
export function BenefitsSummary({locale,points,tickets,hearts}:{locale:AppLocale;points:string;tickets:string;hearts:string}){
 const w=walletCopy(locale),unit=(value:string,asset:'tickets'|'hearts')=>locale==='ko'&&/\d/.test(value)?`${value}${asset==='tickets'?'장':'개'}`:value;
 return <div className={styles.summary}><div data-summary='points' className={`${styles.sumCard} ${styles.sumPoints}`}><span className={styles.sumIcon} aria-hidden='true'><Coins size={26}/></span><div className={styles.sumText}><span>{w.points}</span><strong>{points}</strong></div></div>{(['tickets','hearts'] as const).map(asset=><div className={styles.sumCard} key={asset}><img className={styles.sumIcon} src={`/images/economy/${asset==='tickets'?'ticket':'heart'}.svg`} alt='' width={48} height={48}/><div className={styles.sumText}><span>{asset==='tickets'?ticketLabel(locale):w[asset]}</span><strong>{unit(asset==='tickets'?tickets:hearts,asset)}</strong></div></div>)}</div>;
}
function BenefitsWallet({locale}:{locale:AppLocale}){
 const auth=useGroupRequest(),w=walletCopy(locale),wallet=useGroupResource(auth.authenticated?'/api/me/wallet':null,parseWallet);
 useEffect(()=>{window.addEventListener(GROUP_WALLET_CHANGED_EVENT,wallet.retry);return()=>window.removeEventListener(GROUP_WALLET_CHANGED_EVENT,wallet.retry);},[wallet.retry]);
 if(!auth.ready||wallet.loading)return <BenefitsSkeleton kind='wallet' label={w.loading}/>;
 if(!auth.authenticated)return <FanAction href={`/login?locale=${locale}&returnTo=${encodeURIComponent(`/benefits?locale=${locale}`)}`}>{w.login}</FanAction>;
 if(!wallet.data)return <div role='alert' className={styles.inlineError}><p>{w.error}</p><FanAction onClick={()=>window.dispatchEvent(new Event(GROUP_WALLET_CHANGED_EVENT))}>{w.retry}</FanAction></div>;
 const n=wallet.data;return <BenefitsSummary locale={locale} points={`${n.points.toLocaleString(locale)} P`} tickets={n.tickets.toLocaleString(locale)} hearts={n.hearts.toLocaleString(locale)}/>;
}
export function BenefitsCatalog({kind,locale,heading}:{kind:'raffles';locale:AppLocale;heading?:string}){
 const c=groupBenefitsCopy(locale),t=groupsCopy(locale),r=raffleCopy(locale),w=walletCopy(locale);
 const [cursor,setCursor]=useState<string>(),[previous,setPrevious]=useState<Array<GroupBenefitsCatalog['items'][number]>>([]);
 const resource=useGroupResource<GroupBenefitsCatalog>(`/api/groups/benefits?kind=${kind}${cursor?`&cursor=${encodeURIComponent(cursor)}`:''}`,parseRaffles);
 const items=[...new Map([...previous,...(resource.data?.items??[])].map(item=>[item.id,item])).values()];
 const more=resource.data?.nextCursor?<FanAction variant='text' className={styles.linkChip} onClick={()=>{setPrevious(items);setCursor(resource.data!.nextCursor!);}}>{t.more}</FanAction>:null;
 const retry=()=>{if(cursor&&resource.failure?.code==='GROUP_BENEFITS_NOT_FOUND'){setPrevious([]);setCursor(undefined);}else resource.retry();};
 return <section className={styles.section} aria-label={kind==='raffles'?c.lucky:c.events}>
 {(heading||more)&&<div className={styles.sectionHead}>{heading&&<h2>{heading}</h2>}{more}</div>}
 <div className={kind==='raffles'?styles.raffleCards:styles.events}>
 {kind==='raffles'&&<Link className={styles.raffleCard} href={`/my/capsules?locale=${locale}` as Route}><img src='/images/groups/capsule-closed.png' alt='' width={80} height={80}/><strong>{capsuleCopy(locale).title}</strong><span>{w.tickets}</span><ChevronRight aria-hidden='true'/></Link>}
 {items.map(item=><Link className={kind==='raffles'?styles.raffleCard:styles.event} href={`${item.href}?locale=${locale}` as Route} key={`${kind}:${item.id}`}>
 {item.imageUrl?<GroupImage className={styles.eventImage} src={item.imageUrl} locale={locale} alt='' width={80} height={60}/>:<Ticket aria-hidden='true'/>}
 <span className={styles.raffleTitle}><small className={styles.eventType}>{kind==='raffles'?c.lucky:c.events} · {item.pageName}</small><strong>{item.title}</strong></span><span className={styles.raffleDetails}>{item.description&&<small>{item.description}</small>}{'rewardPoints' in item&&<small>{w.points} {item.rewardPoints.toLocaleString(locale)} P</small>}{'closesAt' in item&&<small>{benefitsRaffleState(locale,item.status)} · {r.deadline} <time dateTime={item.closesAt}>{new Date(item.closesAt).toLocaleString(locale,{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',timeZone:'Asia/Seoul'})}</time></small>}</span><ChevronRight aria-hidden='true'/></Link>)}
 </div>
 {resource.loading&&(items.length?<p role='status'>{t.loading}</p>:<BenefitsSkeleton kind='event' label={t.loading}/>)}
 {resource.error&&<div role='alert' className={styles.inlineError}><p>{w.error}</p><FanAction onClick={retry}>{t.retry}</FanAction></div>}
 {resource.data&&!items.length&&<p>{c.empty}</p>}
 </section>;
}
export function BenefitsSupport({locale,locked}:{locale:AppLocale;locked?:boolean}){
 const auth=useGroupRequest();return <BenefitsSupportOwned key={`${locale}:${auth.ownerKey}`} locale={locale} locked={locked}/>;
}
function BenefitsSupportOwned({locale,locked}:{locale:AppLocale;locked?:boolean}){
 const auth=useGroupRequest(),c=groupBenefitsCopy(locale),w=walletCopy(locale),support=heartSupportCopy(locale);
 const resource=useGroupResource(`/api/public/celebrities?locale=${toContentLocale(locale)}`,parseCreators),wallet=useGroupResource(auth.authenticated?'/api/me/wallet':null,parseWallet);
 const [slug,setSlug]=useState(''),[units,setUnits]=useState('1'),[selection,setSelection]=useState<{slug:string;units:number}|null>(null),supportTrigger=useRef<HTMLAnchorElement>(null);
 useEffect(()=>{window.addEventListener(GROUP_WALLET_CHANGED_EVENT,wallet.retry);return()=>window.removeEventListener(GROUP_WALLET_CHANGED_EVENT,wallet.retry);},[wallet.retry]);
 const limit=Math.min(1000,wallet.data?.hearts??0),lockNode=(node:ReactNode)=>locked?node:<BenefitsComingSoon locale={locale}>{node}</BenefitsComingSoon>;
 const creator=resource.data?.celebrities.find(item=>item.slug===slug)??resource.data?.celebrities[0],quantity=Number(units),valid=auth.ready&&auth.authenticated&&!wallet.loading&&!wallet.error&&Number.isInteger(quantity)&&quantity>=1&&quantity<=1000&&!!wallet.data&&quantity<=wallet.data.hearts;
 return <section className={styles.purpose}><div className={styles.purposeHeading}><img src='/images/economy/heart.svg' alt='' width={48} height={48}/><div><h2>{c.support}</h2></div></div>{lockNode(resource.loading?<BenefitsSkeleton kind='support' label={w.loading}/>:resource.error?<div role='alert' className={styles.inlineError}><p>{w.error}</p><FanAction onClick={resource.retry}>{w.retry}</FanAction></div>:creator?<><div className={styles.supportLayout}><fieldset className={styles.creatorChoices}><legend>{c.creator}</legend><div>{resource.data!.celebrities.map(item=><label className={styles.creatorChoice} key={item.slug}><input type='radio' name='benefits-creator' checked={creator.slug===item.slug} onChange={()=>setSlug(item.slug)}/><span className={styles.creatorPortrait}>{item.image?<CreatorImage slug={item.slug} src={item.image.url} position={item.image.position} photos={undefined} presentation='editorial' locale={locale} width={48} height={48} sizes='48px' alt=''/>:<span aria-hidden='true'>{item.name.slice(0,1)}</span>}<span className={styles.creatorCheck} aria-hidden='true'>✓</span></span><span>{item.name}</span></label>)}</div></fieldset><div className={styles.supportAmount}>{!auth.ready||wallet.loading?<p role='status'>{w.loading}</p>:!auth.authenticated?<FanAction href={`/login?locale=${locale}&returnTo=${encodeURIComponent(`/benefits?locale=${locale}`)}`}>{w.login}</FanAction>:wallet.error||!wallet.data?null:<><label className={styles.supportQuantity}>{support.quantity}<input type='number' min={1} max={limit} step={1} disabled={limit===0} value={limit===0?'0':units} onChange={event=>setUnits(event.target.value)}/></label><div className={styles.supportSlider}>{limit<=1?<div className={styles.sliderControl}><div className={styles.sliderTrack}><div className={styles.sliderThumb} data-disabled='' role='slider' aria-label={support.quantity} aria-valuemin={limit} aria-valuemax={limit} aria-valuenow={limit} aria-disabled='true' style={{position:'absolute',top:'50%',left:limit===1?'100%':'0%',transform:'translate(-50%,-50%)'}}><span className={styles.sliderBubble} aria-hidden='true'>{limit}</span></div></div></div>:<Slider.Root min={1} max={limit} step={1} value={Math.min(Math.max(Number.isFinite(quantity)?quantity:1,1),limit)} onValueChange={value=>setUnits(String(value))}><Slider.Control className={styles.sliderControl}><Slider.Track className={styles.sliderTrack}><Slider.Indicator className={styles.sliderIndicator}/><Slider.Thumb className={styles.sliderThumb} getAriaLabel={()=>support.quantity}><span className={styles.sliderBubble} aria-hidden='true'>{valid?quantity.toLocaleString(locale):'—'}</span></Slider.Thumb></Slider.Track></Slider.Control></Slider.Root>}</div><p>{w.hearts} {wallet.data.hearts.toLocaleString(locale)}</p>{quantity>wallet.data.hearts&&<p role='status'>{support.insufficient}</p>}</>}<a ref={supportTrigger} className={styles.purposeAction} href={`/my/wallet?view=support&creator=${encodeURIComponent(creator.slug)}&locale=${locale}`} aria-disabled={!valid} onClick={event=>{if(event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;event.preventDefault();if(valid)setSelection({slug:creator.slug,units:quantity});}}><span>{support.title}</span><ChevronRight size={20} aria-hidden/></a></div></div></>:<p>{c.empty}</p>)}{selection&&<WalletSupportDialog locale={locale} creatorSlug={selection.slug} initialUnits={selection.units} open onClose={()=>{setSelection(null);requestAnimationFrame(()=>supportTrigger.current?.focus());}}/>}</section>;
}
