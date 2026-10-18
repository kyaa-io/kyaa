import {mkdir,copyFile,readdir,rm} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
process.chdir(fileURLToPath(new URL('.',import.meta.url)));
await rm('dist',{recursive:true,force:true});
await mkdir('dist/assets',{recursive:true});
for (const file of ['index.html','styles.css','app.mjs','helpers.mjs','content.json','robots.txt','sitemap.xml']) await copyFile(file,`dist/${file}`);
for (const file of await readdir('assets')) await copyFile(`assets/${file}`,`dist/assets/${file}`);
console.log('Static site built in dist/');
