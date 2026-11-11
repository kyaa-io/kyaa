import { createServer } from 'vite';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
const web=path.resolve('apps/web');
const beforeCard=execFileSync('git',['show','08cb013e1bba62fd1e46a2ecfae59bdb96e94cac:apps/web/features/groups/ui/stan-lucky-cheer.tsx'],{encoding:'utf8'}).replaceAll('from \"./','from \"@/features/groups/ui/').replace('@/features/capsule-machine/lucky-stage','./before-stage');
await (await import('node:fs/promises')).writeFile('work/lucky-gacha-0836/before-card.generated.tsx',beforeCard);
const server=await createServer({configFile:false,root:path.resolve('work/lucky-gacha-0836'),publicDir:path.join(web,'public'),define:{'process.env.NODE_ENV':JSON.stringify('development')},esbuild:{jsx:'automatic'},resolve:{alias:[{find:/.*features\/auth\/client\/cognito-auth$/,replacement:path.join(web,'e2e/kyaa-wave-participation-local/privy.ts')},{find:/.*byus-session-provider$/,replacement:path.join(web,'e2e/kyaa-wave-participation-local/session.ts')},{find:'next/navigation',replacement:path.join(web,'e2e/groups-local/navigation.ts')},{find:'next/image',replacement:path.join(web,'e2e/mission-local/next-image.tsx')},{find:'@',replacement:web},{find:'next/link',replacement:path.join(web,'e2e/mission-local/next-link.tsx')},{find:'next/dynamic',replacement:path.resolve('work/lucky-gacha-0836/dynamic.tsx')}]},server:{host:'127.0.0.1',port:3186,strictPort:true,fs:{allow:[process.cwd()]}}});
await server.listen(); console.log('http://127.0.0.1:3186');
