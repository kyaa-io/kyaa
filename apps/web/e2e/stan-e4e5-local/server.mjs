// Standalone harness for 덕질 E4·E5 (261107-2 5회차 묶음 G): production GroupBenefitsScreen with the auth/Next adapters replaced,
// /api proxied to a local app (default http://localhost:3141) so the screen reads the local DB. Usage: node e2e/stan-e4e5-local/server.mjs [port] [api]
import {createServer} from 'vite';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url)),web=path.resolve(here,'../..'),shared=path.resolve(here,'../groups-benefits-local');
export async function startHarness(port=5197,api='http://localhost:3141'){
 const server=await createServer({configFile:false,root:here,publicDir:path.join(web,'public'),cacheDir:path.join(here,'.vite'),esbuild:{jsx:'automatic'},resolve:{alias:[
 {find:/.*features\/auth\/client\/cognito-auth$/,replacement:path.join(here,'auth.ts')},
 {find:/.*byus-session-provider$/,replacement:path.join(here,'auth.ts')},
 {find:/.*use-admin-session$/,replacement:path.join(here,'auth.ts')},
 {find:'next/navigation',replacement:path.join(shared,'navigation.ts')},
 {find:'next/link',replacement:path.join(shared,'link.tsx')},
 {find:'next/image',replacement:path.join(shared,'image.tsx')},
 {find:'@privy-io/react-auth',replacement:path.join(here,'auth.ts')},
 {find:'server-only',replacement:path.join(shared,'server-only.ts')},{find:'@',replacement:web}]},
 server:{hmr:false,host:'127.0.0.1',port,strictPort:true,proxy:{'/api':{target:api,changeOrigin:true}},fs:{allow:[path.resolve(web,'../..')]}}});
 await server.listen();return {server,baseURL:`http://127.0.0.1:${port}`};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){const h=await startHarness(Number(process.argv[2]??5197),process.argv[3]);console.log(h.baseURL);}
