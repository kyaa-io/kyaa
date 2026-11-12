// Actual product components; synthetic viewer/stage for reproducible public captures.
import {createServer} from 'vite';
import path from 'node:path';
import {realpathSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url)),web=path.resolve(here,'../..');
const server=await createServer({configFile:false,root:here,publicDir:path.join(web,'public'),esbuild:{jsx:'automatic'},resolve:{dedupe:['react','react-dom'],alias:[{find:/.*features\/groups\/ui\/use-group-resource$/,replacement:path.join(here,'group-resource.ts')},{find:'@',replacement:web},{find:'next/navigation',replacement:path.join(here,'../community-stamps-local/next-navigation.ts')},...['link','image'].map(name=>({find:`next/${name}`,replacement:path.join(here,`../mission-local/next-${name}.tsx`)}))]},server:{host:'127.0.0.1',port:4197,strictPort:true,fs:{allow:[web,path.resolve(web,'../../node_modules'),realpathSync(path.resolve(web,'../../node_modules'))]}}});
await server.listen();console.log('http://127.0.0.1:4197');
