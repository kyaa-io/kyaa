// Isolated, loopback-only rendering of production components; no service or shared harness writes.
import {createServer} from 'vite';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url)),web=path.resolve(here,'../..');
export async function startHarness(port=3136){
 const server=await createServer({configFile:false,root:here,publicDir:path.join(web,'public'),cacheDir:path.join(web,'node_modules/.vite-groups-localization-local'),esbuild:{jsx:'automatic'},resolve:{alias:[
  {find:/.*features\/auth\/client\/cognito-auth$/,replacement:path.join(here,'../kyaa-wave-participation-local/privy.ts')},
  {find:/.*byus-session-provider$/,replacement:path.join(here,'../kyaa-wave-participation-local/session.ts')},
  {find:/^\.\/group-shell$/,replacement:path.join(here,'shell.tsx')},
  {find:'@',replacement:web},{find:'server-only',replacement:path.join(here,'../lounge-local/server-only.ts')},
  {find:'next/navigation',replacement:path.join(here,'../groups-local/navigation.ts')},
  ...['link','image'].map(name=>({find:`next/${name}`,replacement:path.join(here,`../mission-local/next-${name}.tsx`)})),
 ]},server:{host:'127.0.0.1',port,strictPort:true,fs:{allow:[path.resolve(web,'../..')]}}});
 await server.listen();return {server,baseURL:`http://127.0.0.1:${port}`};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){const h=await startHarness();console.log(h.baseURL);}
