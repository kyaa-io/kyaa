import type {ImgHTMLAttributes} from 'react';
type Props=ImgHTMLAttributes<HTMLImageElement>&{fill?:boolean;priority?:boolean;unoptimized?:boolean};
export function getImageProps({fill,priority:_priority,unoptimized:_unoptimized,...props}:Props){return {props:{...props,...(fill?{style:{position:'absolute' as const,width:'100%',height:'100%',inset:0,...props.style}}:{})}};}
export default function Image(input:Props){return <img {...getImageProps(input).props} alt={input.alt??''}/>;}
