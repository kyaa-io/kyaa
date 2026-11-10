import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

/** MY 바로가기 아이콘 시트(imagegen, 3x3, 마젠타 배경)를 칸마다 잘라 배경을 투명하게 만들고 160px WebP로 저장한다.
 * 사용: node scripts/prepare-my-shortcut-icons.mjs <시트.png> — 시트 원본(imagegen 결과)은 저장소 밖에 둔다. 인자로 경로를 넘긴다. */
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const sheet=process.argv[2];
const destination=path.join(root,'apps/web/public/images/my/shortcuts');
const names=['activity','raffles','rewards','live','requests','friends','reports','inquiries','favorites'];
const SIZE=160, BG=[255,0,255];
await mkdir(destination,{recursive:true});
const {data,info}=await sharp(sheet).removeAlpha().raw().toBuffer({resolveWithObject:true});
const cell=Math.floor(info.width/3);
for(const [index,name] of names.entries()) {
  const left=(index%3)*cell, top=Math.floor(index/3)*cell;
  const rgba=Buffer.alloc(cell*cell*4);
  let minX=cell,minY=cell,maxX=0,maxY=0;
  for(let y=0;y<cell;y++) for(let x=0;x<cell;x++) {
    const s=((top+y)*info.width+left+x)*3, o=(y*cell+x)*4;
    const r=data[s],g=data[s+1],b=data[s+2];
    const distance=Math.hypot(r-BG[0],g-BG[1],b-BG[2])/360;
    const alpha=Math.min(1,Math.max(0,(distance-0.1)/0.22));
    // 가장자리는 배경색이 섞여 있으니 섞인 만큼 덜어낸다.
    const unmix=(value,bg)=>alpha>0?Math.min(255,Math.max(0,Math.round((value-(1-alpha)*bg)/alpha))):0;
    rgba[o]=unmix(r,BG[0]);rgba[o+1]=unmix(g,BG[1]);rgba[o+2]=unmix(b,BG[2]);rgba[o+3]=Math.round(alpha*255);
    if(alpha>0.5){minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);}
  }
  const side=Math.max(maxX-minX,maxY-minY)+1, pad=Math.round(side*0.06);
  const box=Math.min(cell,side+pad*2);
  const cx=Math.round((minX+maxX)/2), cy=Math.round((minY+maxY)/2);
  const x0=Math.min(cell-box,Math.max(0,cx-Math.floor(box/2))), y0=Math.min(cell-box,Math.max(0,cy-Math.floor(box/2)));
  await sharp(rgba,{raw:{width:cell,height:cell,channels:4}}).extract({left:x0,top:y0,width:box,height:box}).resize(SIZE,SIZE,{kernel:'lanczos3'}).webp({quality:92,alphaQuality:100,effort:6}).toFile(path.join(destination,`${name}.webp`));
}
console.log(`my shortcut icons: ${names.length} files, cell ${cell}px`);
