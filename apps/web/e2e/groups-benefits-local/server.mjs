import {createServer} from 'vite';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url)),web=path.resolve(here,'../..');
export async function startHarness(port=5196){
 const server=await createServer({configFile:false,root:here,publicDir:path.join(web,'public'),cacheDir:path.join(here,'.vite'),esbuild:{jsx:'automatic'},resolve:{alias:[
 {find:/.*features\/auth\/client\/cognito-auth$/,replacement:path.join(here,'auth.ts')},
 {find:/.*byus-session-provider$/,replacement:path.join(here,'auth.ts')},
 {find:/.*use-admin-session$/,replacement:path.join(here,'auth.ts')},
 {find:'next/navigation',replacement:path.join(here,'navigation.ts')},
 {find:'next/link',replacement:path.join(here,'link.tsx')},
 {find:'next/image',replacement:path.join(here,'image.tsx')},
 {find: /^.*\/auth-fallback$/,replacement:path.join(here,'auth.ts')},
 {find:'server-only',replacement:path.join(here,'server-only.ts')},{find:'@',replacement:web}]},server:{hmr:false,host:'127.0.0.1',port,strictPort:true,fs:{allow:[path.resolve(web,'../..')]}}});
 await server.listen();return {server,baseURL:`http://127.0.0.1:${port}`};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){const h=await startHarness();console.log(h.baseURL);}
