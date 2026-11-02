// Loopback-only API fixtures served with the shared production UI components.
import { createServer } from 'vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url)),web=path.resolve(here,'../..');
export async function startHarness(port=3128) {
 const server=await createServer({configFile:false,root:here,publicDir:path.join(web,'public'),cacheDir:path.join(web,'node_modules/.vite-groups-local'),esbuild:{jsx:'automatic'},resolve:{alias:[
 {find:/.*features\/auth\/client\/cognito-auth$/,replacement:path.join(here,'../kyaa-wave-participation-local/privy.ts')},
 {find:/.*byus-session-provider$/,replacement:path.join(here,'../kyaa-wave-participation-local/session.ts')},
 {find:/.*use-admin-session$/,replacement:path.join(here,'admin.ts')},
 {find:'@',replacement:web},{find:'server-only',replacement:path.join(here,'../lounge-local/server-only.ts')},
 {find:'next/navigation',replacement:path.join(here,'navigation.ts')},
 {find:'@privy-io/react-auth',replacement:path.join(here,'../kyaa-wave-participation-local/privy.ts')},
 ...['link','image'].map(name=>({find:`next/${name}`,replacement:path.join(here,`../mission-local/next-${name}.tsx`)}))]},server:{host:'127.0.0.1',port,strictPort:true,fs:{allow:[path.resolve(web,'../..')]}}});
 await server.listen();return {server,baseURL:`http://127.0.0.1:${port}`};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){const h=await startHarness();console.log(h.baseURL);}
