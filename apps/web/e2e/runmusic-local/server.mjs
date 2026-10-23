// Disposable real-component harness. API responses live only in the browser fixture.
import { createServer } from 'vite';
import path from 'node:path';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url)), web = path.resolve(here, '../..');
export async function startHarness(port = 4211) {
 const server = await createServer({configFile:false,root:here,publicDir:path.join(web,'public'),cacheDir:path.join(web,'../../node_modules/.cache/runmusic-local'),esbuild:{jsx:'automatic'},resolve:{alias:[
  {find:/.*components\/byus-session-provider$/,replacement:path.join(here,'session.ts')},
  {find:/.*\/use-admin-session$/,replacement:path.join(here,'admin-session.ts')},
  {find:'next/navigation',replacement:path.join(here,'navigation.ts')},
  {find:/.*features\/auth\/client\/cognito-auth$/,replacement:path.join(here,'privy.ts')},
  {find:'@privy-io/react-auth',replacement:path.join(here,'privy.ts')},
  {find:'@',replacement:web},
  ...['link','image'].map(name=>({find:`next/${name}`,replacement:path.join(here,`../mission-local/next-${name}.tsx`)})),
 ]},server:{host:'127.0.0.1',port,strictPort:true,fs:{allow:[web,realpathSync(path.resolve(web,'../../node_modules')),realpathSync(path.join(web,'node_modules'))]}}});
 server.middlewares.use((req,res,next)=>{
  if(!req.url?.startsWith('/api/'))return next();
  res.statusCode=503;res.setHeader('content-type','application/json');res.end(JSON.stringify({error:{code:'LOCAL_FIXTURE_ONLY'}}));
 });
 await server.listen();return {server,baseURL:`http://127.0.0.1:${port}`};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){const harness=await startHarness(Number(process.env.PORT??4212));console.log(harness.baseURL);}
