import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';

const source = new URL('../apps/web/public/images/runmusic/official-og.png', import.meta.url);
const mobileSource = new URL('../apps/web/public/images/runmusic/official-og-mobile.png', import.meta.url);
const title = 'RUN&MUSIC 당첨자 발표';
export async function replaceRunmusicWinnerBanner({apply=false, env=process.env, fetcher=globalThis.fetch}={}) {
  const bytes = await readFile(source), mobileBytes = await readFile(mobileSource);
  assert.ok(bytes.length > 0 && bytes.length < 8*1024*1024 && mobileBytes.length > 0 && mobileBytes.length < 8*1024*1024);
  if (!apply) return {status:'PREVIEW', title, image:'/images/runmusic/official-og.png', mobileImage:'/images/runmusic/official-og-mobile.png', dimensions:[1200,672], mobileDimensions:[1200,1200]};
  assert.ok(env.RUNMUSIC_ADMIN_TOKEN && env.RUNMUSIC_APP_URL, 'RUNMUSIC_ADMIN_CREDENTIALS_REQUIRED');
  const base = new URL(env.RUNMUSIC_APP_URL);
  assert.ok(base.protocol==='https:' || (base.protocol==='http:' && ['localhost','127.0.0.1'].includes(base.hostname)));
  const request = async (path,body) => {
    const response=await fetcher(new URL(path,base),{method:body?'POST':'GET',headers:{authorization:`Bearer ${env.RUNMUSIC_ADMIN_TOKEN}`,...(body instanceof FormData?{}:body?{'content-type':'application/json'}:{})},body:body instanceof FormData?body:body?JSON.stringify(body):undefined,redirect:'error',signal:AbortSignal.timeout(15000)});
    assert.ok(response.ok,`RUNMUSIC_ADMIN_API_FAILED ${path} ${response.status}`);
    return response.json();
  };
  const endpoint='/api/admin/home-banners';
  const manager=await request(endpoint);
  const matches=manager.items.filter(item=>item.localizations?.ko?.title===title);
  assert.equal(matches.length,1,'RUNMUSIC_WINNER_BANNER_NOT_UNIQUE');
  const banner=matches[0];
  const form=new FormData();form.set('file',new File([bytes],'runmusic-official-og.png',{type:'image/png'}));
  const {asset}=await request('/api/admin/image-assets',form);
  assert.deepEqual([asset.width,asset.height],[1200,672]);
  const mobileForm=new FormData();mobileForm.set('file',new File([mobileBytes],'runmusic-official-og-mobile.png',{type:'image/png'}));
  const {asset:mobileAsset}=await request('/api/admin/image-assets',mobileForm);
  assert.deepEqual([mobileAsset.width,mobileAsset.height],[1200,1200]);
  const localizations=Object.fromEntries(Object.entries(banner.localizations).map(([locale,entry])=>[locale,{...entry,desktopAssetId:asset.id,mobileAssetId:mobileAsset.id,alt:locale==='ko'?'안동댐 50주년 2026 SBS RUN&MUSIC FESTIVAL in 안동 공식 키비주얼':entry.alt}]));
  const saved=await request(endpoint,{action:'save',id:banner.id,expectedRevision:banner.revision,kind:banner.kind,placement:banner.placement,category:banner.category,celebrityId:banner.celebrityId,localizations});
  const changed=saved.items.find(item=>item.id===banner.id);
  assert.equal(changed?.localizations?.ko?.desktopImage?.id,asset.id,'RUNMUSIC_WINNER_BANNER_SAVE_FAILED');
  return {status:'PASS',bannerId:banner.id,assetId:asset.id};
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href){
  try{assert.ok(process.argv.slice(2).every(arg=>arg==='--apply'));console.log(JSON.stringify(await replaceRunmusicWinnerBanner({apply:process.argv.includes('--apply')}),null,2));}
  catch(error){console.error(error.message);process.exitCode=1;}
}
