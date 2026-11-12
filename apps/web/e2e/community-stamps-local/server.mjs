// Isolated browser fixture: actual product component/CSS; synthetic auth and API.
import { createServer } from 'vite';
import path from 'node:path';
import {realpathSync} from 'node:fs';
import { fileURLToPath } from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url)), web=path.resolve(here,'../..');
export async function startHarness() {
 const server=await createServer({configFile:false,root:here,publicDir:path.join(web,'public'),cacheDir:path.join(here,'.vite'),esbuild:{jsx:'automatic'},resolve:{alias:[{find:'server-only',replacement:path.join(here,'../lounge-local/server-only.ts')},{find:/.*features\/auth\/client\/cognito-auth$/,replacement:path.join(here,'privy.ts')},{find:'@',replacement:web},{find:'next/navigation',replacement:path.join(here,'next-navigation.ts')},{find: /^.*\/auth-fallback$/,replacement:path.join(here,'privy.ts')},...['link','image'].map(name=>({find:`next/${name}`,replacement:path.join(here,`../mission-local/next-${name}.tsx`)}))]},server:{host:'127.0.0.1',port:0,strictPort:true,fs:{allow:[web,realpathSync(path.resolve(web,'../../node_modules')),realpathSync(path.join(web,'node_modules'))]}}});
 try {
  await new Promise((resolve, reject) => {
   server.httpServer.once('error', reject);
   server.httpServer.listen(0, '127.0.0.1', () => {
    server.httpServer.off('error', reject);
    resolve();
   });
  });
  const address=server.httpServer?.address();
  if (!address || typeof address === 'string') throw new Error('Harness did not bind a TCP port');
  return {server,baseURL:`http://127.0.0.1:${address.port}`};
 } catch (error) {
  await server.close();
  throw error;
 }
}
if(process.argv[1]===fileURLToPath(import.meta.url)) { const h=await startHarness();console.log(h.baseURL); }
