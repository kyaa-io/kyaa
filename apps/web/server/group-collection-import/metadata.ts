import 'server-only';
import {ImportError,remoteUrl} from './safe-fetch';
function decode(value:string){return value.replace(/&(?:amp|quot|apos|lt|gt|#\d+|#x[\da-f]+);/gi,s=>{const named:Record<string,string>={'&amp;':'&','&quot;':'"','&apos;':"'",'&lt;':'<','&gt;':'>'};if(named[s.toLowerCase()])return named[s.toLowerCase()];const n=s[2]?.toLowerCase()==='x'?parseInt(s.slice(3,-1),16):Number(s.slice(2,-1));return Number.isInteger(n)&&n>0&&n<=0x10ffff?String.fromCodePoint(n):s;});}
function objects(value:unknown):Record<string,unknown>[] {
 const pending:{value:unknown;depth:number}[]=[{value,depth:0}],result:Record<string,unknown>[]=[];let visited=0;
 while(pending.length){const item=pending.pop()!;if(++visited>1024||item.depth>32)throw new ImportError('INVALID_CONTENT');
  if(Array.isArray(item.value)){if(item.value.length+pending.length>1024)throw new ImportError('INVALID_CONTENT');for(let i=item.value.length-1;i>=0;i--)pending.push({value:item.value[i],depth:item.depth+1});}
  else if(item.value&&typeof item.value==='object'){const record=item.value as Record<string,unknown>;result.push(record);if(record['@graph']!==undefined)pending.push({value:record['@graph'],depth:item.depth+1});}
 }
 return result;
}
export function productMetadata(html:string,base:URL){let title:unknown,image:unknown;
 for(const script of html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)){try{const p=objects(JSON.parse(script[1])).find(v=>v['@type']==='Product'||Array.isArray(v['@type'])&&v['@type'].includes('Product'));if(p){title=p.name;image=p.image;if(Array.isArray(image))image=image[0];if(image&&typeof image==='object')image=(image as Record<string,unknown>).url;break;}}catch{/* Invalid metadata falls back to source Open Graph fields. */}}
 const meta:Record<string,string>={};for(const m of html.matchAll(/<meta\b[^>]*>/gi)){const a:Record<string,string>={};for(const attr of m[0].matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g))a[attr[1].toLowerCase()]=decode(attr[2]??attr[3]);const k=a.property??a.name;if(k&&a.content&&meta[k]===undefined)meta[k]=a.content;}
 title=typeof title==='string'&&title.length?title:meta['og:title'];image=typeof image==='string'&&image.length?image:meta['og:image'];
 if(typeof title!=='string'||!title.trim()||title.length>200||typeof image!=='string'||!image)throw new ImportError('INVALID_CONTENT');
 let imageUrl:string;try{imageUrl=remoteUrl(new URL(image,base).href).href;}catch{throw new ImportError('INVALID_CONTENT');}return {title,imageUrl};
}
