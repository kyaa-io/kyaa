import {createServer} from 'vite';
import path from 'node:path';
const web=path.resolve('apps/web');
const s=await createServer({configFile:false,root:path.join(web,'e2e/hot-list-local'),esbuild:{jsx:'automatic'},define:{'process.env':'{}'},publicDir:path.join(web,'public'),resolve:{alias:{'@':web,'next/link':path.join(web,'e2e/hot-list-local/link.tsx')}},server:{host:'127.0.0.1',port:4238}});await s.listen();
