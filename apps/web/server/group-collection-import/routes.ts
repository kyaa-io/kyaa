import 'server-only';
import {z} from 'zod';
import type {FanpageDependencies} from '@/server/fanpage/routes';
import {boundedJson,CertificationBodyError} from '@/server/certification/certification-http';
import {AuthError} from '@/features/auth/domain/auth-errors';
import {normalizePublicImage,MAX_PUBLIC_IMAGE_BYTES} from '@/server/media/public-image-processing';
import {safeRemote,ImportError} from './safe-fetch';
import {productMetadata} from './metadata';
const headers={'cache-control':'private, no-store',vary:'Authorization','x-content-type-options':'nosniff'};
const input=z.object({kind:z.enum(['lookup','image']),url:z.string().min(1).max(2048)}).strict();
type Dependencies=Pick<FanpageDependencies,'authorize'|'rpc'>&{remote?:typeof safeRemote;normalize?:typeof normalizePublicImage};
export function createCollectionImportHandler(deps:Dependencies){return async(request:Request,pageId:string)=>{try{
 const page=z.uuid().parse(pageId),owner=await deps.authorize(request.headers.get('authorization'));
 const value=input.parse(await boundedJson(request,4096));
 // This gate uses the same active-user and owner/manager authorization as collection-save.
 const allowed=await deps.rpc('group_authorize_collection_import',{p_actor:owner.appUserId,p_page_id:page});if(allowed!==true)throw new Error('GROUP_ACTIVITY_FORBIDDEN');
 const signal=AbortSignal.any([request.signal,AbortSignal.timeout(10000)]);
 const remote=await(deps.remote??safeRemote)(value.url,value.kind==='image'?MAX_PUBLIC_IMAGE_BYTES:512*1024,{signal});
 if(value.kind==='lookup'){
  if(!/^(text\/html|application\/xhtml\+xml)(?:;|$)/i.test(remote.headers['content-type']??''))throw new ImportError('INVALID_CONTENT');
  return Response.json({...productMetadata(remote.bytes.toString('utf8'),remote.url),externalUrl:value.url},{headers});
 }
 if(!/^image\/(jpeg|png|webp)(?:;|$)/i.test(remote.headers['content-type']??''))throw new ImportError('INVALID_CONTENT');
 const normalized=await(deps.normalize??normalizePublicImage)(remote.bytes);signal.throwIfAborted();
 return new Response(new Uint8Array(normalized.bytes),{headers:{...headers,'content-type':'image/webp','content-disposition':'attachment; filename="collection.webp"'}});
 }catch(error){let status=503,code='COLLECTION_IMPORT_UNAVAILABLE';if(error instanceof AuthError){status=error.status;code=error.code;}else if(error instanceof z.ZodError||error instanceof SyntaxError){status=400;code='COLLECTION_IMPORT_INVALID';}else if(error instanceof CertificationBodyError){status=error.code==='BODY_TOO_LARGE'?413:400;code=error.code;}else if(error instanceof ImportError){status=error.code==='TOO_LARGE'?413:error.code==='INVALID_URL'?400:422;code=`COLLECTION_IMPORT_${error.code}`;}else if(error instanceof Error&&['GROUP_ACTIVITY_FORBIDDEN','GROUP_ACTIVITY_NOT_FOUND','FAN_WEB_ACTIVE_ACCOUNT_REQUIRED','GROUP_COLLECTION_IMPORT_RATE_LIMITED'].includes(error.message)){code=error.message;status=code.endsWith('RATE_LIMITED')?429:code.endsWith('NOT_FOUND')?404:403;}return Response.json({error:{code}},{status,headers});}};}
