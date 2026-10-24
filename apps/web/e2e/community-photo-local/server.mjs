// Real composer and photo conversion, synthetic authentication/API only.
import { createServer } from 'vite';
import path from 'node:path';
import sharp from 'sharp';
import assert from 'node:assert/strict';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url)), web = path.resolve(here, '../..');
export const state = { uploads: [], assets: new Map(), posted: null, fail: false };
export async function startHarness() {
 const server = await createServer({configFile:false,root:here,publicDir:path.join(web,'public'),cacheDir:path.join(web,'test-results/community-photo-local/vite-cache'),esbuild:{jsx:'automatic'},plugins:[{name:'photo-api',configureServer(server){server.middlewares.use(async(req,res,next)=>{
 if(!req.url?.startsWith('/api/')) return next();
 const reply=(status,data)=>{res.statusCode=status;res.setHeader('content-type','application/json');res.end(JSON.stringify(data));};
 try {
 const chunks=[];for await(const chunk of req) chunks.push(chunk);const bytes=Buffer.concat(chunks);
 if(req.url==='/api/content-assets' && req.method==='POST') {
  if(bytes.length>4.5*1024*1024) return reply(413,{error:{code:'BODY_TOO_LARGE'}});
  if(state.fail) return reply(503,{error:{code:'UNAVAILABLE'}});
  const form=await new Request('http://127.0.0.1:4217'+req.url,{method:'POST',headers:req.headers,body:bytes}).formData();
  assert.equal(form.get('celebritySlug'),'elina');
  const file=form.get('file'),body=Buffer.from(await file.arrayBuffer()),meta=await sharp(body).metadata(),id=crypto.randomUUID();
  state.assets.set(id,{body,type:meta.format==='webp'?'image/webp':'image/png'});
  state.uploads.push({bytes:bytes.length,width:meta.width,height:meta.height,alpha:meta.hasAlpha});
  await new Promise(resolve=>setTimeout(resolve,300));
  return reply(201,{asset:{id,width:meta.width,height:meta.height}});
 }
 if(req.url.startsWith('/api/content-assets/')) {const asset=state.assets.get(req.url.split('/').at(-1));res.setHeader('content-type',asset.type);return res.end(asset.body);}
 if(req.url==='/api/celebrities/elina/posts'){state.posted=JSON.parse(bytes);return reply(201,{id:crypto.randomUUID(),revision:1,replayed:false});}
 return reply(404,{});
 } catch(error){console.error(error);return reply(500,{error:{code:'FIXTURE_ERROR'}});}
 });}}],resolve:{alias:[
 {find:/.*components\/byus-session-provider$/,replacement:path.join(here,'../wave-media-local/session.ts')},
 {find:/.*features\/auth\/client\/cognito-auth$/,replacement:path.join(here,'../community-stamps-local/privy.ts')},
 {find:'@privy-io/react-auth',replacement:path.join(here,'../community-stamps-local/privy.ts')},
 ...['link','image','navigation'].map(name=>({find:`next/${name}`,replacement:path.join(here,`../mission-local/next-${name}.${name==='navigation'?'ts':'tsx'}`)})),
 {find:'@',replacement:web}]},server:{host:'127.0.0.1',port:4217,strictPort:true,fs:{allow:[web,realpathSync(path.resolve(web,'../../node_modules')),realpathSync(path.join(web,'node_modules'))]}}});
 await server.listen(); return server;
}
