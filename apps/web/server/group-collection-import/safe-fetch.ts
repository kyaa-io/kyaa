import 'server-only';
import https from 'node:https';
import {lookup} from 'node:dns/promises';
import {isIP} from 'node:net';
export type Address={address:string;family:number};
export type RemoteResponse={status:number;headers:Record<string,string|undefined>;bytes:Buffer};
export class ImportError extends Error{constructor(readonly code:'INVALID_URL'|'FETCH_FAILED'|'TOO_LARGE'|'INVALID_CONTENT'){super(code);}}
// Conservative global-unicast allowlist excludes mapped/transition IPv6 and special-use IPv4.
export function publicAddress(address:string){
 if(isIP(address)===4){const [a,b,c]=address.split('.').map(Number);return !(a===0||a===10||a===127||a>=224||a===100&&b>=64&&b<=127||a===169&&b===254||a===172&&b>=16&&b<=31||a===192&&(b===0||b===168||b===88&&c===99)||a===198&&(b===18||b===19||b===51&&c===100)||a===203&&b===0&&c===113);}
 if(isIP(address)!==6)return false;
 const groups=address.toLowerCase().split(':');const first=parseInt(groups[0],16),second=parseInt(groups[1]||'0',16);
 return first>=0x2000&&first<=0x3fff&&!(first===0x2001&&(second<0x200||second===0xdb8))&&first!==0x2002&&!(first===0x3fff&&second<0x1000);
}
export function remoteUrl(value:string){let u:URL;try{u=new URL(value);}catch{throw new ImportError('INVALID_URL');}if(u.protocol!=='https:'||u.username||u.password||u.port&&u.port!=='443'||value.length>2048)throw new ImportError('INVALID_URL');const h=u.hostname.toLowerCase().replace(/^\[|\]$/g,'');if(h==='localhost'||h.endsWith('.localhost')||h.endsWith('.local')||h.endsWith('.internal')||h.endsWith('.'))throw new ImportError('INVALID_URL');return u;}
export type PinnedTransport=(url:URL,address:Address,maxBytes:number,signal:AbortSignal)=>Promise<RemoteResponse>;
export const pinnedHttps:PinnedTransport=(url,address,maxBytes,signal)=>new Promise((resolve,reject)=>{
 const host=url.hostname.replace(/^\[|\]$/g,'');
 const req=https.request(url,{method:'GET',agent:false,family:address.family,signal,servername:isIP(host)?undefined:host,lookup:(_hostname,_options,callback)=>{callback(null,address.address,address.family);},headers:{accept:'text/html,application/xhtml+xml,image/jpeg,image/png,image/webp','user-agent':'kyaa-Collection-Import/1.0','accept-encoding':'identity'}},res=>{
  if(Number(res.headers['content-length'])>maxBytes){res.destroy();reject(new ImportError('TOO_LARGE'));return;}
  const chunks:Buffer[]=[];let total=0;res.on('data',(chunk:Buffer)=>{total+=chunk.length;if(total>maxBytes){res.destroy(new ImportError('TOO_LARGE'));}else chunks.push(chunk);});res.on('error',reject);res.on('end',()=>{const headers:Record<string,string|undefined>={};for(const[k,v]of Object.entries(res.headers))headers[k]=Array.isArray(v)?v[0]:v;resolve({status:res.statusCode??0,headers,bytes:Buffer.concat(chunks)});});
 });req.setTimeout(5000,()=>req.destroy(new ImportError('FETCH_FAILED')));req.on('error',reject);req.end();
});
export async function safeRemote(value:string,maxBytes:number,deps:{resolve?:(host:string)=>Promise<Address[]>;transport?:PinnedTransport;signal?:AbortSignal}={}){
 const signal=deps.signal??AbortSignal.timeout(10000);let url=remoteUrl(value);const resolve=deps.resolve??(host=>lookup(host,{all:true,verbatim:true}));
 for(let redirects=0;redirects<=3;redirects++){
  signal.throwIfAborted();const host=url.hostname.replace(/^\[|\]$/g,'');const addresses=isIP(host)?[{address:host,family:isIP(host)}]:await Promise.race([resolve(host),new Promise<never>((_,reject)=>{if(signal.aborted)reject(signal.reason);else signal.addEventListener('abort',()=>reject(signal.reason),{once:true});})]);
  if(!addresses.length||addresses.some(a=>!publicAddress(a.address)||isIP(a.address)!==a.family))throw new ImportError('INVALID_URL');
  // Transport connects to this exact checked IP while retaining the original Host and TLS SNI.
  const response=await(deps.transport??pinnedHttps)(url,addresses[0],maxBytes,signal);
  if([301,302,303,307,308].includes(response.status)){if(redirects===3||!response.headers.location)throw new ImportError('FETCH_FAILED');url=remoteUrl(new URL(response.headers.location,url).href);continue;}
  if(response.status<200||response.status>=300)throw new ImportError('FETCH_FAILED');if(response.bytes.length>maxBytes)throw new ImportError('TOO_LARGE');return {...response,url};
 }
 throw new ImportError('FETCH_FAILED');
}
