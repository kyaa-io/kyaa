"use client";
import {useState,useEffect,useLayoutEffect,useRef,type CSSProperties} from 'react';
import {ArrowLeft,ArrowRight} from 'lucide-react';
import type {AppLocale} from '@/i18n/locales';
import {FanAction} from '@/components/fan-ui/fan-action';
import {localizedBannerHref,type HomeBanner} from '@/features/home/domain/home-banner';
import {bannerCategoryLabel} from '@/features/home/domain/banner-category';
import {discoveryCopy} from './discovery-copy';
import styles from './discovery-carousel.module.css';
type Slide = {id:string;title:string;body:string;action:string;image:HomeBanner['desktopImage'];mobileImage:HomeBanner['desktopImage'];alt:string;href:string;category:string};
function BannerSlide({slide,inactive}:{slide:Slide;inactive:boolean}){
 const frame=useRef<HTMLElement>(null),copy=useRef<HTMLDivElement>(null),[extended,setExtended]=useState(false);
 useLayoutEffect(()=>{
  const element=frame.current,content=copy.current;if(!element||!content)return;
  const measure=()=>{const width=element.getBoundingClientRect().width;if(!width)return;const mobile=window.matchMedia('(max-width:1023px)').matches;const imageHeight=width*(mobile?5/6:1/2);setExtended(content.getBoundingClientRect().height>imageHeight*(mobile?.8:.45));};
  measure();const observer=typeof ResizeObserver==='undefined'?null:new ResizeObserver(measure);observer?.observe(element);observer?.observe(content);window.addEventListener('resize',measure);return()=>{observer?.disconnect();window.removeEventListener('resize',measure);};
 },[slide.title,slide.body,slide.action]);
 return <article ref={frame} className={styles.slide} data-extended={extended||undefined} aria-hidden={inactive||undefined} inert={inactive}><picture className={styles.photograph}><source media="(max-width:1023px)" srcSet={slide.mobileImage.url} width={slide.mobileImage.width} height={slide.mobileImage.height}/><img src={slide.image.url} width={slide.image.width} height={slide.image.height} alt={slide.alt}/></picture><div ref={copy} className={styles.copy}><div><span className={styles.category}>{slide.category}</span><h2>{slide.title}</h2><p>{slide.body}</p></div><FanAction href={slide.href} trailingIcon={<ArrowRight/>}>{slide.action}</FanAction></div></article>;
}
export function DiscoveryCarousel({locale,banners}:{locale:AppLocale;banners:HomeBanner[]}){
 const [active,setActive]=useState(0),[paused,setPaused]=useState(false),[hovered,setHovered]=useState(false),[focused,setFocused]=useState(false),[visible,setVisible]=useState(true),[reduced,setReduced]=useState(false),c=discoveryCopy(locale);
 useEffect(()=>{const media=window.matchMedia('(prefers-reduced-motion: reduce)');const update=()=>setReduced(media.matches);const visibility=()=>setVisible(!document.hidden);update();visibility();media.addEventListener('change',update);document.addEventListener('visibilitychange',visibility);return()=>{media.removeEventListener('change',update);document.removeEventListener('visibilitychange',visibility);};},[]);
 useEffect(()=>{if(banners.length<2||paused||hovered||focused||!visible||reduced)return;const timer=window.setTimeout(()=>setActive(value=>(value+1)%banners.length),6000);return()=>window.clearTimeout(timer);},[active,paused,hovered,focused,visible,reduced,banners.length]);
 const slides=banners.map(banner=>({id:banner.id,title:banner.title,body:banner.description,action:banner.ctaLabel,image:banner.desktopImage,mobileImage:banner.mobileImage??banner.desktopImage,alt:banner.alt,href:localizedBannerHref(banner.href,locale),category:bannerCategoryLabel(banner.category??(banner.kind==='regular_live'?'live':'announcement'),locale)}));
 const index=active%Math.max(1,slides.length),track=useRef<HTMLDivElement>(null),[viewportHeight,setViewportHeight]=useState<number>();
 useLayoutEffect(()=>{const item=track.current?.children[index] as HTMLElement|undefined;if(!item)return;const measure=()=>{const height=item.getBoundingClientRect().height;if(height)setViewportHeight(height);};measure();const observer=typeof ResizeObserver==='undefined'?null:new ResizeObserver(measure);observer?.observe(item);window.addEventListener('resize',measure);return()=>{observer?.disconnect();window.removeEventListener('resize',measure);};},[index,banners]);
 if(!slides.length)return null;
 return <section className={styles.carousel} aria-label={c.title} aria-roledescription='carousel' onMouseEnter={()=>setHovered(true)} onMouseLeave={()=>setHovered(false)} onFocus={()=>setFocused(true)} onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node|null))setFocused(false);}}><div className={styles.viewport} style={viewportHeight?{height:viewportHeight}:undefined}><div ref={track} className={styles.track} style={{'--active':index} as CSSProperties}>{[...slides,...(slides.length>1?[slides[0]]:[])].map((slide,i)=><BannerSlide key={i} slide={slide} inactive={i!==index}/>)}</div></div>{slides.length>1&&<div className={styles.controls}><div className={styles.balance}><button className={styles.pause} onClick={()=>setPaused(value=>!value)} aria-label={locale==='ko'?(paused?'자동 넘김 재생':'자동 넘김 일시정지'):(paused?'Resume automatic slides':'Pause automatic slides')}>{paused?'▶':'Ⅱ'}</button></div><div className={styles.dots}>{slides.map((slide,index)=><button key={slide.id} onClick={()=>setActive(index)} aria-label={slide.title} aria-pressed={index===active%slides.length}><span/></button>)}</div><div className={styles.arrows}><button onClick={()=>setActive((index+slides.length-1)%slides.length)} aria-label={locale==='ko'?'이전 배너':'Previous slide'}><ArrowLeft size={20}/></button><button onClick={()=>setActive((index+1)%slides.length)} aria-label={locale==='ko'?'다음 배너':'Next slide'}><ArrowRight size={20}/></button></div></div>}</section>;
}
