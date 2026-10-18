import {mkdir,copyFile,readdir} from 'node:fs/promises';
await mkdir('dist/assets',{recursive:true});
for (const file of ['index.html','styles.css','app.mjs','helpers.mjs','content.json','robots.txt','sitemap.xml']) await copyFile(file,`dist/${file}`);
for (const file of await readdir('assets')) await copyFile(`assets/${file}`,`dist/assets/${file}`);
console.log('Static site built in dist/');
