// Run in an Aside REPL with duoTab attached to the loopback harness. No API writes.
var duoAudit = [];
var duoMeasure = () => {
  const main = document.querySelector('main');
  const visible = e => !e.closest('[inert],[hidden]') && e.getBoundingClientRect().width > 0 && e.getBoundingClientRect().height > 0;
  const elements = Array.from(main.querySelectorAll('*')).filter(visible);
  const numeric = elements.filter(e => Array.from(e.childNodes).some(n => n.nodeType === 3 && /\d/.test(n.textContent)));
  const blocks = Array.from(main.querySelectorAll('[data-duo-profile],[data-duo-lucky],[data-cell],[data-fan-missions],[data-duo-today],[data-duo-rail],[data-duo-history]')).map(e=>({kind:e.getAttributeNames().find(n=>n.startsWith('data-')),x:e.getBoundingClientRect().x,y:e.getBoundingClientRect().y,width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height}));
  return {width:innerWidth,scroll:document.documentElement.scrollWidth,blocks,
    overflow:elements.filter(e=>e.getBoundingClientRect().right>innerWidth+1 || e.getBoundingClientRect().left< -1).map(e=>e.tagName+':'+e.className),
    brokenImages:elements.filter(e=>e.tagName==='IMG'&&e.complete&&!e.naturalWidth).map(e=>e.getAttribute('src')),
    numericCount:numeric.length,tnumFailures:numeric.filter(e=>!getComputedStyle(e).fontVariantNumeric.includes('tabular-nums')||!getComputedStyle(e).fontFeatureSettings.includes('tnum')).map(e=>e.textContent),
    mutations:window.duoRequests.filter(r=>r.method!=='GET')};
};
for (var lang of ['ko','en','ja','zh-Hans','zh-Hant','es','id','vi','th','pt','fr','ru']) {
  for (var width of [390,1440]) {
    await duoTab.setViewportSize({width,height:900});
    await duoTab.goto('http://127.0.0.1:5198/benefits?locale='+lang+'&audit=final');
    await duoTab.locator('[data-duo-fan-row]').first().waitFor();
    await duoTab.locator('[data-cell="points"] button:enabled').waitFor();
    await fs.writeFile('snapshot-'+lang+'-'+width+'.txt',(await snapshot(duoTab,{selector:'main'})).tree);
    var result = await duoTab.evaluate(duoMeasure);
    if(width===390){
      await duoTab.locator('[data-cell="points"] button').click();
      await duoTab.locator('[role="dialog"]').waitFor();
      result.sheet=await duoTab.evaluate(()=>{const d=document.querySelector('[role="dialog"]');return {width:d.getBoundingClientRect().width,height:d.getBoundingClientRect().height,overflow:Array.from(d.querySelectorAll('*')).filter(e=>e.getBoundingClientRect().right>innerWidth+1).map(e=>e.tagName),buttonHeights:Array.from(d.querySelectorAll('button')).map(e=>e.getBoundingClientRect().height)};});
      await duoTab.keyboard.press('Escape');
      await duoTab.waitForFunction(()=>document.activeElement===document.querySelector('[data-cell=points] button'));
      result.focusReturned=await duoTab.locator('[data-cell="points"] button').evaluate(e=>e===document.activeElement);
    }
    duoAudit.push({lang,...result});
  }
}
await fs.writeFile('duo-audit.json',JSON.stringify(duoAudit,null,2));
if (duoAudit.some(r=>r.scroll>r.width||r.overflow.length||r.brokenImages.length||r.tnumFailures.length||r.mutations.length||r.focusReturned===false||r.sheet?.overflow.length)) throw new Error('DUO browser audit failed; inspect duo-audit.json');
console.log(JSON.stringify({count:duoAudit.length,failures:duoAudit.filter(r=>r.scroll>r.width||r.overflow.length||r.brokenImages.length||r.tnumFailures.length||r.mutations.length||r.focusReturned===false||r.sheet?.overflow.length).map(r=>({lang:r.lang,width:r.width,overflow:r.overflow,tnum:r.tnumFailures,focus:r.focusReturned,sheet:r.sheet}))},null,2));
