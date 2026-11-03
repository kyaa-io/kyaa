"use client";
import {WalletSupportDialog} from '@/features/group-wallet/ui/wallet-screen';
import {useEffect,useState} from 'react';
import {z} from 'zod';
import {Camera,ChevronRight,ListChecks,Ticket} from 'lucide-react';
import {FanAppFrame,FanContentContainer} from '@/components/fan-shell/fan-app-shell';
import {FanAction} from '@/components/fan-ui/fan-action';
import {CreatorImage} from '@/components/fan-ui/creator-image';
import {type AppLocale,toContentLocale} from '@/i18n/locales';
import {groupBenefitsCatalogSchema,type GroupBenefitsCatalog} from '@/server/group-benefits/domain';
import {walletSchema} from '@/server/group-wallet/domain';
import {walletCopy,heartSupportCopy} from '@/features/group-wallet/ui/copy';
import {capsuleCopy} from '@/features/group-capsule/copy';
import {raffleCopy} from '@/features/group-raffle/copy';
import {GroupImage} from './group-image';
import {GROUP_WALLET_CHANGED_EVENT,useGroupRequest,useGroupResource} from './use-group-resource';
import {groupsCopy} from './copy';
import {groupBenefitsCopy,benefitsRaffleState} from './group-benefits-copy';
import styles from './group-benefits.module.css';
const parseWallet=(value:unknown)=>walletSchema.parse(value);
const parseRaffles=(value:unknown)=>groupBenefitsCatalogSchema.options[0].parse(value);
const parseMissions=(value:unknown)=>groupBenefitsCatalogSchema.options[1].parse(value);
const creatorsSchema=z.object({celebrities:z.array(z.object({slug:z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),name:z.string(),image:z.object({url:z.string(),position:z.string()}).optional()}))});
const parseCreators=(value:unknown)=>creatorsSchema.parse(value);
export function GroupBenefitsScreen({locale}:{locale:AppLocale}){
 const auth=useGroupRequest(),c=groupBenefitsCopy(locale),w=walletCopy(locale);
 return <FanAppFrame locale={locale} currentPath='/benefits' groupsEnabled mainId='benefits-main'><FanContentContainer as='main' id='benefits-main' className={styles.page}>
 <header className={styles.heading}><h1>{c.title}</h1><FanAction variant='text' href={`/my/raffles?locale=${locale}`}>{c.history}</FanAction></header>
 <section className={styles.walletSection} aria-label={walletCopy(locale).wallet}><h2>{walletCopy(locale).wallet}</h2><BenefitsWallet locale={locale}/></section>
 <div className={styles.purposes}><section className={styles.purpose}><div className={styles.purposeHeading}><img src='/images/economy/ticket.svg' alt='' width={48} height={48}/><div><h2>{c.lucky}</h2><p>{w.tickets}</p></div></div><a className={styles.purposeEntry} href={`/my/capsules?locale=${locale}`}><img src='/images/groups/capsule-closed.png' alt='' width={64} height={64}/><span>{capsuleCopy(locale).title}</span><ChevronRight size={20} aria-hidden/></a><FanAction href={`/my/wallet?locale=${locale}`} ariaLabel={`${w.tickets} · ${w.exchange}`}>{w.tickets} · {w.exchange}</FanAction></section><BenefitsSupport key={locale} locale={locale}/></div>
 <section className={styles.participation} aria-label={c.listing}><h2>{c.listing}</h2><BenefitsCatalog key={`raffles:${auth.ownerKey}`} kind='raffles' locale={locale}/><BenefitsCatalog key={`missions:${auth.ownerKey}`} kind='missions' locale={locale}/></section>
 </FanContentContainer></FanAppFrame>;
}
function BenefitsWallet({locale}:{locale:AppLocale}){
 const auth=useGroupRequest(),w=walletCopy(locale),wallet=useGroupResource(auth.authenticated?'/api/me/wallet':null,parseWallet);
 useEffect(()=>{window.addEventListener(GROUP_WALLET_CHANGED_EVENT,wallet.retry);return()=>window.removeEventListener(GROUP_WALLET_CHANGED_EVENT,wallet.retry);},[wallet.retry]);
 if(!auth.ready||wallet.loading)return <p role='status'>{w.loading}</p>;
 if(!auth.authenticated)return <FanAction href={`/login?locale=${locale}&returnTo=${encodeURIComponent(`/benefits?locale=${locale}`)}`}>{w.login}</FanAction>;
 if(!wallet.data)return <div role='alert'><p>{w.error}</p><FanAction onClick={wallet.retry}>{w.retry}</FanAction></div>;
 return <div className={styles.balances}><div className={styles.points}><span>{w.points}</span><strong>{wallet.data.points.toLocaleString(locale)} P</strong><FanAction variant='text' href={`/my/wallet?locale=${locale}#wallet-history`}>{w.history}</FanAction></div><div className={styles.assets}>{(['tickets','hearts'] as const).map(asset=><div key={asset}><img className={styles.assetIcon} src={`/images/economy/${asset==='tickets'?'ticket':'heart'}.svg`} alt='' width={48} height={48}/><span>{w[asset]}</span><strong>{wallet.data![asset].toLocaleString(locale)}</strong><small className={styles.exchangeRate}>{wallet.data!.pointCost.toLocaleString(locale)} P = {locale==='ko'?asset==='tickets'?'1장':'1개':`1 ${w[asset]}`}</small></div>)}</div></div>;
}
function BenefitsCatalog({kind,locale}:{kind:'raffles'|'missions';locale:AppLocale}){
 const c=groupBenefitsCopy(locale),t=groupsCopy(locale),r=raffleCopy(locale),w=walletCopy(locale);
 const [cursor,setCursor]=useState<string>(),[previous,setPrevious]=useState<Array<GroupBenefitsCatalog['items'][number]>>([]);
 const resource=useGroupResource<GroupBenefitsCatalog>(`/api/groups/benefits?kind=${kind}${cursor?`&cursor=${encodeURIComponent(cursor)}`:''}`,kind==='raffles'?parseRaffles:parseMissions);
 const items=[...new Map([...previous,...(resource.data?.items??[])].map(item=>[item.id,item])).values()];
 const retry=()=>{if(cursor&&resource.failure?.code==='GROUP_BENEFITS_NOT_FOUND'){setPrevious([]);setCursor(undefined);}else resource.retry();};
 return <section className={styles.section} aria-label={kind==='raffles'?c.lucky:c.events}>
 <div className={styles.events}>
 {items.map(item=><a className={styles.event} href={`${item.href}?locale=${locale}`} key={`${kind}:${item.id}`}>
 {item.imageUrl?<GroupImage className={styles.eventImage} src={item.imageUrl} locale={locale} alt='' width={80} height={60}/>:kind==='raffles'?<Ticket aria-hidden='true'/>:'submissionKind' in item&&item.submissionKind==='photo'?<Camera aria-hidden='true'/>:<ListChecks aria-hidden='true'/>}
 <span><small className={styles.eventType}>{kind==='raffles'?c.lucky:c.events} · {item.pageName}</small><strong>{item.title}</strong>{item.description&&<small>{item.description}</small>}{'rewardPoints' in item&&<small>{w.points} {item.rewardPoints.toLocaleString(locale)} P</small>}{'closesAt' in item&&<small>{benefitsRaffleState(locale,item.status)} · {r.deadline} <time dateTime={item.closesAt}>{new Date(item.closesAt).toLocaleString(locale,{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',timeZone:'Asia/Seoul'})}</time></small>}</span><ChevronRight aria-hidden='true'/></a>)}
 </div>
 {resource.loading&&<p role='status'>{t.loading}</p>}
 {resource.error&&<div role='alert'><p>{w.error}</p><FanAction onClick={retry}>{t.retry}</FanAction></div>}
 {resource.data&&!items.length&&<p>{c.empty}</p>}
 {resource.data?.nextCursor&&<FanAction onClick={()=>{setPrevious(items);setCursor(resource.data!.nextCursor!);}}>{t.more}</FanAction>}
 </section>;
}
function BenefitsSupport({locale}:{locale:AppLocale}){
 const c=groupBenefitsCopy(locale),w=walletCopy(locale),support=heartSupportCopy(locale),resource=useGroupResource(`/api/public/celebrities?locale=${toContentLocale(locale)}`,parseCreators),[slug,setSlug]=useState(''),[supportSlug,setSupportSlug]=useState<string|null>(null);
 const creator=resource.data?.celebrities.find(item=>item.slug===slug)??resource.data?.celebrities[0];
 return <section className={styles.purpose}><div className={styles.purposeHeading}><img src='/images/economy/heart.svg' alt='' width={48} height={48}/><div><h2>{c.support}</h2><p>{w.hearts}</p></div></div>{resource.loading?<p role='status'>{w.loading}</p>:resource.error?<div role='alert'><p>{w.error}</p><FanAction onClick={resource.retry}>{w.retry}</FanAction></div>:creator?<><div className={styles.support}>{creator.image&&<CreatorImage slug={creator.slug} src={creator.image.url} position={creator.image.position} photos={undefined} presentation='editorial' locale={locale} width={64} height={48} sizes='64px' alt=''/>}<label className={styles.creatorSelect}><span className={styles.selectLabel}>{c.creator}</span><select value={creator.slug} onChange={event=>setSlug(event.target.value)}>{resource.data!.celebrities.map(item=><option key={item.slug} value={item.slug}>{item.name}</option>)}</select></label></div><a className={styles.purposeAction} href={`/my/wallet?view=support&creator=${encodeURIComponent(creator.slug)}&locale=${locale}`} onClick={event=>{if(event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;event.preventDefault();setSupportSlug(creator.slug);}}><span>{support.title}</span><ChevronRight size={20} aria-hidden/></a></>:<p>{c.empty}</p>}<FanAction href={`/my/wallet?locale=${locale}`} ariaLabel={`${w.hearts} · ${w.exchange}`}>{w.hearts} · {w.exchange}</FanAction>{supportSlug&&<WalletSupportDialog locale={locale} creatorSlug={supportSlug} open onClose={()=>setSupportSlug(null)}/>}</section>;
}
