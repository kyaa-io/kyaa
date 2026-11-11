// Loopback only: renders the real page against synthetic read-only fixtures.
import {createServer} from 'vite';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url)),web=path.resolve(here,'../..'),shared=path.join(here,'../groups-benefits-local');
const server=await createServer({configFile:false,root:here,publicDir:path.join(web,'public'),cacheDir:path.join(web,'node_modules/.vite-duo'),esbuild:{jsx:'automatic'},define:{'process.env':{}},resolve:{alias:[
 {find:/.*features\/auth\/client\/cognito-auth$/,replacement:path.join(shared,'auth.ts')},
 {find:/.*byus-session-provider$/,replacement:path.join(shared,'auth.ts')},
 {find:/.*use-admin-session$/,replacement:path.join(shared,'auth.ts')},
 {find:/.*use-selected-bias$/,replacement:path.join(here,'bias.ts')},
 ...['navigation','link','image'].map(name=>({find:'next/'+name,replacement:path.join(shared,name+(name==='navigation'?'.ts':'.tsx'))})),
 {find: /^.*\/auth-fallback$/,replacement:path.join(shared,'auth.ts')},
 {find:'server-only',replacement:path.join(shared,'server-only.ts')},{find:'@',replacement:web},
]},server:{host:'127.0.0.1',port:5198,strictPort:true,hmr:false,fs:{allow:[path.resolve(web,'../..')]}}});
await server.listen();console.log('DUO fixture: http://127.0.0.1:5198/benefits?locale=ko');
