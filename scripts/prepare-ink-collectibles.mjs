import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const sources=path.join(root,'docs/design/assets/ink-v1');
const entries=[];
for(const [kind,folder] of [['stamps','stamps'],['tiers','passport/tiers']]) {
  const source=path.join(sources,kind), destination=path.join(root,'apps/web/public/images',folder,'ink-v1');
  const catalog=JSON.parse(await readFile(path.join(source,'provenance.json'),'utf8'));
  const names=catalog.keys??catalog.assets.map(item=>item.name);
  await mkdir(destination,{recursive:true});
  for(const name of names) {
    const png=await readFile(path.join(source,`${name}.png`));
    const webp=await sharp(png).webp({lossless:true,effort:6}).toBuffer();
    const original=await sharp(png).ensureAlpha().raw().toBuffer({resolveWithObject:true});
    const decoded=await sharp(webp).ensureAlpha().raw().toBuffer({resolveWithObject:true});
    assert.equal(original.info.width,512);assert.equal(original.info.height,512);
    assert.deepEqual(decoded.info,original.info);assert(decoded.data.equals(original.data),`${name}: RGBA must remain identical`);
    assert(webp.length<png.length,`${name}: compression must reduce bytes`);
    await writeFile(path.join(destination,`${name}.webp`),webp);
    entries.push({kind,name,width:512,height:512,pngBytes:png.length,webpBytes:webp.length,rgbaIdentical:true,sha256:createHash('sha256').update(webp).digest('hex')});
  }
}
assert.equal(entries.length,25);
const frameSource=await readFile(path.join(sources,'stamps/frame.svg'));
// The original mask inherited this red ink from CSS; preserve that rendered color in WebP.
const frame=Buffer.from(frameSource.toString().replace('stroke="black"','stroke="#b4242d"'));
const frameWebp=await sharp(frame).resize(512,512).webp({lossless:true,effort:6}).toBuffer();
assert((await sharp(frame).resize(512,512).ensureAlpha().raw().toBuffer()).equals(await sharp(frameWebp).ensureAlpha().raw().toBuffer()));
await writeFile(path.join(root,'apps/web/public/images/stamps/ink-v1/frame.webp'),frameWebp);
const report={revision:'carved-ink-lossless-1',format:'webp-lossless',masters:'docs/design/assets/ink-v1',pngBytes:entries.reduce((n,a)=>n+a.pngBytes,0),webpBytes:entries.reduce((n,a)=>n+a.webpBytes,0),frame:{svgBytes:frameSource.length,webpBytes:frameWebp.length,renderInk:'#b4242d',rgbaIdentical:true},assets:entries};
await writeFile(path.join(root,'apps/web/public/images/stamps/ink-v1/manifest.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({assets:entries.length,pngBytes:report.pngBytes,webpBytes:report.webpBytes,reductionPercent:Number((100*(1-report.webpBytes/report.pngBytes)).toFixed(1)),frame:report.frame,rgbaIdentical:true}));
