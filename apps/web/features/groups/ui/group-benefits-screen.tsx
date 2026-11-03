"use client";
import {useEffect,useState} from 'react';
import {z} from 'zod';
import {Camera,ChevronRight,ListChecks} from 'lucide-react';
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
import {groupBenefitsCopy} from './group-benefits-copy';
import styles from './group-benefits.module.css';
const parseWallet=(value:unknown)=>walletSchema.parse(value);
const parseRaffles=(value:unknown)=>groupBenefitsCatalogSchema.options[0].parse(value);
const parseMissions=(value:unknown)=>groupBenefitsCatalogSchema.options[1].parse(value);
const creatorsSchema=z.object({celebrities:z.array(z.object({slug:z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),name:z.string(),image:z.object({url:z.string(),position:z.string()}).optional()}))});
const parseCreators=(value:unknown)=>creatorsSchema.parse(value);
export function GroupBenefitsScreen({locale}:{locale:AppLocale}){
 const auth=useGroupRequest(),c=groupBenefitsCopy(locale);
 return <FanAppFrame locale={locale} currentPath='/benefits' groupsEnabled mainId='benefits-main'><FanContentContainer as='main' id='benefits-main' className={styles.page}>
 <header className={styles.heading}><h1>{c.title}</h1><FanAction variant='text' href={`/my/raffles?locale=${locale}`}>{c.history}</FanAction></header>
 <BenefitsWallet locale={locale}/>
 <BenefitsCatalog key={`raffles:${auth.ownerKey}`} kind='raffles' locale={locale}/>
 <div className={styles.activities}><BenefitsSupport key={locale} locale={locale}/><BenefitsCatalog key={`missions:${auth.ownerKey}`} kind='missions' locale={locale}/></div>
 </FanContentContainer></FanAppFrame>;
}
function BenefitsWallet({locale}:{locale:AppLocale}){
 const auth=useGroupRequest(),w=walletCopy(locale),wallet=useGroupResource(auth.authenticated?'/api/me/wallet':null,parseWallet);
 useEffect(()=>{window.addEventListener(GROUP_WALLET_CHANGED_EVENT,wallet.retry);return()=>window.removeEventListener(GROUP_WALLET_CHANGED_EVENT,wallet.retry);},[wallet.retry]);
 if(!auth.ready||wallet.loading)return <p role='status'>{w.loading}</p>;
 if(!auth.authenticated)return <FanAction href={`/login?locale=${locale}&returnTo=${encodeURIComponent(`/benefits?locale=${locale}`)}`}>{w.login}</FanAction>;
 if(!wallet.data)return <div role='alert'><p>{w.error}</p><FanAction onClick={wallet.retry}>{w.retry}</FanAction></div>;
 return <section className={styles.balances} aria-label={w.wallet}><div className={styles.points}><span>{w.points}</span><strong>{wallet.data.points.toLocaleString(locale)} P</strong><FanAction variant='text' href={`/my/wallet?locale=${locale}#wallet-history`}>{w.history}</FanAction></div><div className={styles.assets}>{(['tickets','hearts'] as const).map(asset=><div key={asset}><span>{w[asset]}</span><strong>{wallet.data![asset].toLocaleString(locale)}</strong><FanAction href={`/my/wallet?locale=${locale}`} aria-label={`${w[asset]} · ${w.exchange}`}>{w.exchange}</FanAction></div>)}</div></section>;
}
function BenefitsCatalog({kind,locale}:{kind:'raffles'|'missions';locale:AppLocale}){
 const c=groupBenefitsCopy(locale),t=groupsCopy(locale),r=raffleCopy(locale),w=walletCopy(locale);
 const [cursor,setCursor]=useState<string>(),[previous,setPrevious]=useState<Array<GroupBenefitsCatalog['items'][number]>>([]);
 const resource=useGroupResource<GroupBenefitsCatalog>(`/api/groups/benefits?kind=${kind}${cursor?`&cursor=${encodeURIComponent(cursor)}`:''}`,kind==='raffles'?parseRaffles:parseMissions);
 const items=[...new Map([...previous,...(resource.data?.items??[])].map(item=>[item.id,item])).values()];
 const retry=()=>{if(cursor&&resource.failure?.code==='GROUP_BENEFITS_NOT_FOUND'){setPrevious([]);setCursor(undefined);}else resource.retry();};
 return <section className={styles.section} aria-label={kind==='raffles'?c.lucky:c.events}><h2>{kind==='raffles'?c.lucky:c.events}</h2>
 <div className={kind==='raffles'?styles.cards:styles.events}>
 {kind==='raffles'&&<article className={styles.card}><div className={styles.cardBody}><img src='/images/groups/capsule-closed.png' alt='' width={120} height={120}/><h3>{capsuleCopy(locale).title}</h3></div><FanAction href={`/my/capsules?locale=${locale}`}>{c.details}</FanAction></article>}
 {items.map(item=>kind==='raffles'?<article className={styles.card} key={item.id}><div className={styles.cardBody}>{item.imageUrl&&<GroupImage src={item.imageUrl} locale={locale} alt='' width={120} height={80}/>}<div><span className={styles.meta}>{item.pageName}</span><h3>{item.title}</h3><p>{item.description}</p></div></div>{'closesAt' in item&&<p className={styles.meta}>{r.deadline} · <time dateTime={item.closesAt}>{new Date(item.closesAt).toLocaleString(locale,{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',timeZone:'Asia/Seoul'})}</time></p>}<FanAction href={`${item.href}?locale=${locale}`}>{c.details}</FanAction></article>:<a className={styles.event} href={`${item.href}?locale=${locale}`} key={item.id}>{'submissionKind' in item&&item.submissionKind==='photo'?<Camera aria-hidden='true'/>:<ListChecks aria-hidden='true'/>}<span><strong>{item.title}</strong><small>{item.pageName}{'rewardPoints' in item&&` · ${w.points} ${item.rewardPoints.toLocaleString(locale)} P`}</small>{item.description&&<small>{item.description}</small>}</span><ChevronRight aria-hidden='true'/></a>)}
 </div>
 {resource.loading&&<p role='status'>{t.loading}</p>}
 {resource.error&&<div role='alert'><p>{w.error}</p><FanAction onClick={retry}>{t.retry}</FanAction></div>}
 {resource.data&&!items.length&&<p>{c.empty}</p>}
 {resource.data?.nextCursor&&<FanAction onClick={()=>{setPrevious(items);setCursor(resource.data!.nextCursor!);}}>{t.more}</FanAction>}
 </section>;
}
function BenefitsSupport({locale}:{locale:AppLocale}){
 const c=groupBenefitsCopy(locale),w=walletCopy(locale),support=heartSupportCopy(locale),resource=useGroupResource(`/api/public/celebrities?locale=${toContentLocale(locale)}`,parseCreators),[slug,setSlug]=useState('');
 const creator=resource.data?.celebrities.find(item=>item.slug===slug)??resource.data?.celebrities[0];
 return <section className={styles.section}><h2>{c.support}</h2>{resource.loading?<p role='status'>{w.loading}</p>:resource.error?<div role='alert'><p>{w.error}</p><FanAction onClick={resource.retry}>{w.retry}</FanAction></div>:creator?<><label className={styles.creatorSelect}>{c.creator}<select value={creator.slug} onChange={event=>setSlug(event.target.value)}>{resource.data!.celebrities.map(item=><option key={item.slug} value={item.slug}>{item.name}</option>)}</select></label><div className={styles.support}>{creator.image&&<CreatorImage slug={creator.slug} src={creator.image.url} position={creator.image.position} photos={undefined} presentation='editorial' locale={locale} width={144} height={108} sizes='144px' alt=''/>}<h3>{creator.name}</h3></div><FanAction href={`/my/wallet?view=support&creator=${encodeURIComponent(creator.slug)}&locale=${locale}`}>{support.title}</FanAction></>:<p>{c.empty}</p>}</section>;
}
