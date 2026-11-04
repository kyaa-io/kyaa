"use client";
import {useEffect,useRef,type ReactNode} from "react";

/** Horizontal tab strip that keeps the current tab (`aria-current=page`) visible.
 * Aligns on mount, when `current` changes, and after a width change (resize/rotation)
 * only if the current tab is no longer fully visible, so manual scrolling is kept.
 * Only the strip's own scrollLeft moves; the page never scrolls vertically. */
export function FanTabNav({id,className,label,current,children}:{id?:string;className?:string;label:string;current:string;children:ReactNode}){
 const ref=useRef<HTMLElement>(null);
 useEffect(()=>{
  const nav=ref.current;if(!nav)return;
  const fit=(force:boolean)=>{
   const link=nav.querySelector<HTMLElement>('[aria-current=page]');
   if(!link||nav.scrollWidth<=nav.clientWidth)return;
   const n=nav.getBoundingClientRect(),l=link.getBoundingClientRect();
   if(!force&&l.left>=n.left-.5&&l.right<=n.right+.5)return;
   nav.scrollLeft+=l.left-n.left-(n.width-l.width)/2;
  };
  fit(true);
  const focus=(event:FocusEvent)=>{const link=event.target instanceof HTMLElement?event.target.closest<HTMLElement>('a'):null;if(!link||!nav.contains(link))return;const n=nav.getBoundingClientRect(),l=link.getBoundingClientRect(),pad=4;if(l.left<n.left+pad)nav.scrollLeft-=n.left+pad-l.left;else if(l.right>n.right-pad)nav.scrollLeft+=l.right-(n.right-pad);};
  nav.addEventListener('focusin',focus);
  let width=nav.clientWidth;
  if(typeof ResizeObserver==='undefined')return()=>nav.removeEventListener('focusin',focus);
  const observer=new ResizeObserver(()=>{if(nav.clientWidth===width)return;width=nav.clientWidth;fit(false);});
  observer.observe(nav);
  return()=>{observer.disconnect();nav.removeEventListener('focusin',focus);};
 },[current]);
 return <nav id={id} ref={ref} className={className} aria-label={label}>{children}</nav>;
}
