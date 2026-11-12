import {createServer} from 'vite';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url)),web=path.resolve(here,'../..');
const port=Number(process.env.RANK_HOLD_PORT||5199);
const server=await createServer({configFile:false,root:here,publicDir:path.join(web,'public'),cacheDir:path.join(web,'node_modules/.vite-rank-hold'),esbuild:{jsx:'automatic'},define:{'process.env':{}},resolve:{alias:[
 {find:/.*features\/auth\/client\/cognito-auth$/,replacement:path.join(here,'auth.ts')},
 {find:/.*features\/auth\/client\/public-read-auth$/,replacement:path.join(here,'auth.ts')},
 {find:/.*byus-session-provider$/,replacement:path.join(here,'auth.ts')},
 {find:'next/navigation',replacement:path.join(here,'navigation.ts')},
 {find:'next/link',replacement:path.join(here,'link.tsx')},
 {find:'next/image',replacement:path.join(here,'image.tsx')},
 {find:'server-only',replacement:path.join(here,'server-only.ts')},
 {find:'@',replacement:web}]},server:{hmr:false,host:'127.0.0.1',port,strictPort:true,fs:{allow:[path.resolve(web,'../..')]}}});
await server.listen();console.log(`http://127.0.0.1:${port}`);
