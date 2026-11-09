import {mkdir,copyFile,readdir,rm,readFile,writeFile,cp} from 'node:fs/promises';
import {renderPage} from './search.mjs';
import {fileURLToPath} from 'node:url';
process.chdir(fileURLToPath(new URL('.',import.meta.url)));
await rm('dist',{recursive:true,force:true});
await mkdir('dist/assets',{recursive:true});
for (const file of ['styles.css','app.mjs','helpers.mjs','robots.txt','sitemap.xml','favicon.ico']) await copyFile(file,`dist/${file}`);
for (const file of await readdir('assets')) await copyFile(`assets/${file}`,`dist/assets/${file}`);
await mkdir('dist/en',{recursive:true});
const template=await readFile('index.html','utf8');
// Keys starting with '_' are private working notes and never ship.
const copy=Object.fromEntries(Object.entries(JSON.parse(await readFile('content.json','utf8'))).filter(([key])=>!key.startsWith('_')));
await writeFile('dist/content.json',JSON.stringify(copy));
await writeFile('dist/index.html',renderPage(template,copy,'ko'));
await writeFile('dist/en/index.html',renderPage(template,copy,'en'));
await cp('public','dist',{recursive:true});
console.log('Static KO/EN site built in dist/');
