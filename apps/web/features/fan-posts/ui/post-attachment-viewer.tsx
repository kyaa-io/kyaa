"use client";
import {useState} from 'react';
import {Dialog} from '@base-ui/react/dialog';
import {ChevronLeft,ChevronRight,Play,X} from 'lucide-react';
import type {AppLocale} from '@/i18n/locales';
import {contentCopy} from '@/i18n/catalogs/features__fan_posts__ui';
import {paginationCopy} from '@/i18n/catalogs/common__pagination';
import {waveMediaCopy} from '@/i18n/catalogs/features__fanpage__wave-media';
import {ContentAssetImage} from '@/features/content-safety/ui/content-asset';
import {AuthenticatedMedia} from '@/features/content-safety/ui/authenticated-media';
import type {FanPost} from '../domain/content';
import styles from './post-attachment-viewer.module.css';

type Props={assets:FanPost['assets'];video?:FanPost['video'];locale:AppLocale};
export function PostAttachmentViewer({assets,video,locale}:Props){
 const [selected,setSelected]=useState(0),[open,setOpen]=useState(false),[playing,setPlaying]=useState(false);
 const copy=contentCopy(locale),page=paginationCopy(locale),media=waveMediaCopy(locale),asset=assets[selected]??assets[0],count=assets.length||Number(Boolean(video));
 if(!count)return null;
 const photo=(thumbnail=false,index=selected)=><ContentAssetImage asset={assets[index]??assets[0]} locale={locale} alt={thumbnail?'':copy.photo} thumbnail={thumbnail}/>;
 const controls=assets.length>1&&<><button className={styles.previous} type='button' aria-label={page.previous} disabled={selected===0} onClick={()=>setSelected(value=>value-1)}><ChevronLeft size={20}/></button><button className={styles.next} type='button' aria-label={page.next} disabled={selected===assets.length-1} onClick={()=>setSelected(value=>value+1)}><ChevronRight size={20}/></button></>;
 const thumbnails=<div className={styles.thumbnails}>{assets.map((item,index)=><div className={styles.thumbnail} key={item.id}><div className={styles.thumbnailMedia}>{photo(true,index)}</div><button className={styles.selectThumbnail} type='button' aria-label={`${copy.photo} ${index+1}`} aria-pressed={selected===index} onClick={()=>setSelected(index)}/></div>)}</div>;
 return <div className={`${styles.viewer} ${!asset?styles.videoViewer:''}`}>
  <div className={styles.current}>
   {asset?photo():video&&<><AuthenticatedMedia asset={{...video,kind:'video'}} locale={locale} alt={media.play} play={playing}/>{!playing&&<button type='button' className={styles.play} aria-label={media.play} onClick={()=>setPlaying(true)}><Play size={24}/></button>}</>}
   {controls}<span className={styles.position} aria-live='polite'>{selected+1} / {count}</span>
  </div>
  <div className={styles.selection}>{asset?thumbnails:<><strong>1 / 1</strong><span>{locale==='ko'?'첨부 영상':media.play}</span>{video&&<div className={`${styles.thumbnail} ${styles.videoThumbnail}`}><div className={styles.thumbnailMedia}><AuthenticatedMedia asset={{...video,kind:'video'}} locale={locale} alt=''/></div><button type='button' className={styles.selectThumbnail} aria-label={`${media.play} 1`} aria-pressed='true' onClick={()=>setPlaying(true)}/></div>}</>}
   <Dialog.Root open={open} onOpenChange={setOpen}>
    <Dialog.Trigger className={styles.viewAll}>{media.viewAll}</Dialog.Trigger>
    <Dialog.Portal><Dialog.Backdrop className={styles.backdrop}/><Dialog.Popup className={styles.popup}>
     <div className={styles.dialogHeading}><Dialog.Title>{asset?copy.photo:media.play}</Dialog.Title><Dialog.Close className={styles.close} aria-label={copy.cancel}><X size={20}/></Dialog.Close></div>
     {open&&<><div className={`${styles.expanded} ${!asset?styles.expandedVideo:''}`}>{asset?photo():video&&<AuthenticatedMedia asset={{...video,kind:'video'}} locale={locale} alt={media.play} play/>}{controls}<span className={styles.position} aria-live='polite'>{selected+1} / {count}</span></div>{asset&&thumbnails}</>}
    </Dialog.Popup></Dialog.Portal>
   </Dialog.Root>
  </div>
 </div>;
}
