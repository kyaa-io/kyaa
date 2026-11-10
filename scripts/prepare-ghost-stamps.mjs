import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

/** 아직 받지 않은 칸에 놓는 흐린 회색 스탬프. 받은 칸과 같은 그림(ink-v1)을 회색 한 색으로 눌러 만들어, 받으면 같은 모양에 색이 차오른다. */
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const source=path.join(root,'apps/web/public/images/stamps/ink-v1');
const destination=path.join(root,'apps/web/public/images/stamps/ghost-v1');
const names=['survey','daily-checkin','post','first-comment','share','invite','subscription','steady-checkin','membership','frame'];
const GRAY=[142,146,152], ALPHA=0.5;
await mkdir(destination,{recursive:true});
for(const name of names) {
  const {data,info}=await sharp(path.join(source,`${name}.webp`)).ensureAlpha().resize(256,256).raw().toBuffer({resolveWithObject:true});
  for(let i=0;i<data.length;i+=4){data[i]=GRAY[0];data[i+1]=GRAY[1];data[i+2]=GRAY[2];data[i+3]=Math.round(data[i+3]*ALPHA);}
  await sharp(data,{raw:info}).webp({lossless:true,effort:6}).toFile(path.join(destination,`${name}.webp`));
}
console.log(`ghost-v1: ${names.length} files`);
