const { app } = require('electron');
const { spawn } = require('node:child_process');
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const directory = process.env.KYAA_SMOKE_DIR;
if (!directory) throw Error('KYAA_SMOKE_DIR required');
fs.mkdirSync(directory, { recursive: true });
app.setPath('userData', path.join(directory, 'test-profile'));
let controller, output, source;
const evidence = { synthetic: true, checks: [] };
const wait = async (predicate, label, seconds = 20) => {
  for (let i = 0; i < seconds * 10; i++) { const result = await predicate(); if (result) return result; await new Promise(resolve => setTimeout(resolve, 100)); }
  throw Error(`Timed out: ${label}`);
};
app.on('browser-window-created', (_event, window) => window.webContents.on('did-finish-load', () => {
  if (window.webContents.getURL().includes('surface=audience')) output = window;
  else if (window.webContents.getURL().startsWith('http://127.0.0.1:')) controller = window;
}));
require('../dist-native/main.cjs');
const read = () => controller.webContents.executeJavaScript("fetch('/api/state').then(r=>r.json())");
const click = text => controller.webContents.executeJavaScript(`(()=>{const button=[...document.querySelectorAll('button')].find(b=>b.textContent===${JSON.stringify(text)});if(!button||button.disabled)throw Error('Button unavailable');button.click();})()`);
const send = async (action, values = {}) => {
  const ack = await controller.webContents.executeJavaScript(`(async()=>{const {state}=await fetch('/api/state').then(r=>r.json());return new Promise((resolve,reject)=>{const ws=new WebSocket('ws://'+location.host+'/ws');const timeout=setTimeout(()=>{ws.close();reject(Error('Command timeout'))},3000);ws.onopen=()=>ws.send(JSON.stringify({type:'command',id:crypto.randomUUID(),revision:state.revision,action:${JSON.stringify(action)},...${JSON.stringify(values)}}));ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.type==='ack'){clearTimeout(timeout);ws.close();resolve(m)}};ws.onerror=reject;})})()`);
  assert(ack.ok, ack.error);
};
async function capture(window, name, width, height) {
  const debuggerAPI = window.webContents.debugger;
  debuggerAPI.attach('1.3');
  try {
    await debuggerAPI.sendCommand('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    // An occluded controller can suspend animation frames; screenshots must not wait on them.
    await window.webContents.executeJavaScript('document.body.getBoundingClientRect().width');
    await new Promise(resolve => setTimeout(resolve, 300));
    const result = await debuggerAPI.sendCommand('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(directory, name), Buffer.from(result.data, 'base64'));
    if (window === output) {
      const fit = await output.webContents.executeJavaScript(`(()=>({width:innerWidth,height:innerHeight,items:[...document.querySelectorAll('.lottery-winner')].map(e=>{const r=e.getBoundingClientRect(),n=e.querySelector('strong');return {bottom:r.bottom,right:r.right,top:r.top,left:r.left,font:Number.parseFloat(getComputedStyle(n).fontSize),text:n.textContent}})}))()`);
      assert(fit.items.every(item => item.bottom <= fit.height && item.top >= 0 && item.left >= 0 && item.right <= fit.width && item.font >= 16), JSON.stringify(fit));
      evidence.checks.push({ name, ...fit });
    }
  } finally { await debuggerAPI.sendCommand('Emulation.clearDeviceMetricsOverride'); debuggerAPI.detach(); }
}
(async () => {
  try {
    await wait(() => controller && output, 'windows');
    await wait(() => controller.webContents.executeJavaScript("document.body.innerText.includes('컨트롤러 연결됨')"), 'pairing');
    const setup = await controller.webContents.executeJavaScript('window.stageNative.getSetup()');
    await controller.webContents.executeJavaScript(`window.stageNative.selectDisplay(${JSON.stringify(setup.displays[0].id)})`);
    if (process.env.KYAA_RESTORE_CHECK === '1') {
      const restored = await controller.webContents.executeJavaScript("window.stageNative.readContent('pre-01')");
      assert(restored.cue.script.includes('리허설 전용 대본 · 관객에게 숨김'));
      assert(Object.values(restored.cue.slideText).includes('리허설 편집 확인'));
      console.log('NATIVE_RESTART_PASS: saved script and slide text reloaded from isolated disk profile');
      app.exit(0); return;
    }
    await send('goto', { cueId: 'pre-01' });
    await click('이 화면 문구·대본 편집');
    await wait(() => controller.webContents.executeJavaScript("document.querySelectorAll('.show-editor textarea').length>1"), 'editor');
    await capture(controller, 'editor-1440.png', 1440, 900);
    for (const [field, value] of [['script', '리허설 전용 대본 · 관객에게 숨김'], ['text', '리허설 편집 확인']]) {
      await controller.webContents.executeJavaScript(`(()=>{const set=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set;const input=[...document.querySelectorAll('.show-editor textarea')].find(e=>e.id.includes(${JSON.stringify('-' + field + '-')}));set.call(input,${JSON.stringify(value)});input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
    }
    await click('저장하고 반영');
    await wait(() => output.webContents.executeJavaScript("document.querySelector('iframe')?.contentDocument?.body.innerText.includes('리허설 편집 확인')"), 'edited output');
    assert(!(await output.webContents.executeJavaScript("document.querySelector('iframe').contentDocument.body.innerText.includes('리허설 전용 대본')")));
    assert.equal(await output.webContents.executeJavaScript('typeof window.stageNative.readContent'), 'undefined');
    await capture(output, 'edited-slide-1440.png', 1440, 900);
    await send('goto', { cueId: 'pre-home' }); await send('goto', { cueId: 'pre-01' });
    await wait(() => output.webContents.executeJavaScript("document.querySelector('iframe')?.contentDocument?.body.innerText.includes('리허설 편집 확인')"), 'edit reentry');
    evidence.checks.push({ name: 'native-editor-save-and-reentry', passed: true });
    console.log('NATIVE_EDITOR_PASS');

    const names = ['Alexandra Kim-Santos', '김하늘별빛응원단', 'Nguyễn Thị Minh Anh', 'Samantha Rose Williams', 'ธนพร ศรีสวัสดิ์'];
    const prize = { title: '리허설 선물 · Chillsa 모자', creatorName: '합성 데이터', winnerQuantity: 20 };
    const projection = { presentation: null, tiktok: null, presentationFailed: false, tiktokFailed: false, scope: 'all', onsite: null,
      draw: { creators: [{ name: '합성 데이터', participantCount: 100 }], prizes: [prize], results: [{ ...prize, winners: Array.from({ length: 20 }, (_, i) => ({ displayName: names[i % names.length], displayCode: `TEST-${String(i + 1).padStart(3, '0')}` })) }].map(({ winnerQuantity, ...result }) => result), executedAt: new Date().toISOString() } };
    const endpoint = decodeURIComponent(new URL(setup.sourceUrl).hash.slice('#stage-host='.length));
    source = spawn('node', [path.join(__dirname, 'native-source.cjs')], { stdio: ['ignore', 'ignore', 'inherit', 'ipc'] });
    source.close = () => { if (source.connected) source.send({ close: true }); };
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(Error('Source connection timeout')), 7000);
      source.on('message', message => { if (message === '__open__') { clearTimeout(timer); resolve(); } });
      source.once('error', reject); source.send({ connect: endpoint });
    });
    console.log('NATIVE_SOURCE_OPEN');
    source.send(JSON.stringify({ type: 'projection', projection }));
    const participant = { id: 'a0000000-0000-4000-8000-000000000001', name: '리허설 참가자', quizCorrectAt: null, bingoCompletedAt: null, stamps: [] };
    const operator = { ready: true, participants: [participant], onsite: { drawId: null, entryCount: 100, revealedThrough: 0 } };
    source.send(JSON.stringify({ type: 'operator-state', operator }));
    await wait(async () => (await read()).state.operator?.ready, 'source operator');
    await controller.webContents.executeJavaScript("document.querySelector('.operator-details').open=true");
    const received = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(Error('Operator command timeout')), 5000);
      source.on('message', raw => { const message = JSON.parse(raw); if (message.type === 'operator-command') { clearTimeout(timer); resolve(message); } });
    });
    await click('퀴즈 스탬프');
    const message = await received;
    assert.equal(message.operation, 'quiz-stamp'); assert.equal(message.participantId, participant.id);
    participant.quizCorrectAt = new Date().toISOString();
    participant.stamps = [{ key: 'quiz-correct', status: 'queued', stampId: 'b0000000-0000-4000-8000-000000000001' }];
    source.send(JSON.stringify({ type: 'operator-state', operator }));
    source.send(JSON.stringify({ type: 'operator-result', commandId: message.commandId, status: 'confirmed' }));
    await wait(() => controller.webContents.executeJavaScript("document.querySelector('.operator-participants').innerText.includes('발급 대기')"), 'operator result');
    const publicState = await output.webContents.executeJavaScript("fetch('/api/state').then(r=>r.json())");
    assert(!JSON.stringify(publicState).includes(participant.name)); assert.equal(publicState.state.operator, undefined);
    await capture(controller, 'operator-1440.png', 1440, 900);
    evidence.checks.push({ name: 'native-button-through-mocked-source', operation: message.operation, privateAudienceIsolation: true });
    console.log('NATIVE_OPERATOR_PASS');

    await send('goto', { cueId: 'live-talk' }); await send('lottery', { operation: 'select', mode: 'live', index: 0 });
    await send('lottery', { operation: 'audio', audio: false });
    await send('pointer', { x: .5, y: .5, visible: true });
    await wait(() => output.webContents.executeJavaScript("!!document.querySelector('.laser-pointer')"), 'LIVE center laser');
    await send('pointer', { x: .5, y: .5, visible: false });
    await capture(output, 'lottery-prize-1920.png', 1920, 1080);
    await send('lottery', { operation: 'roll' });
    await wait(() => output.webContents.executeJavaScript("document.querySelector('.lottery-machine video')?.currentTime>0.3"), 'lotto decoder');
    await capture(output, 'lottery-rolling-1920.png', 1920, 1080);
    await output.webContents.executeJavaScript(`window.revealTimes=[];window.lastRevealed=0;window.revealObserver=new MutationObserver(()=>{const value=Number(document.querySelector('.lottery-footer p')?.textContent.match(/확정 당첨자 (\\d+)/)?.[1]||0);if(value>window.lastRevealed){window.revealTimes.push({count:value,at:performance.now()});window.lastRevealed=value}});window.revealObserver.observe(document.querySelector('.projection-content'),{childList:true,subtree:true,characterData:true})`);
    await send('lottery', { operation: 'reveal' });
    await wait(async () => (await read()).state.lottery.revealedCount === 20, 'twenty winners', 25);
    const times = await output.webContents.executeJavaScript('window.revealTimes');
    assert.equal(times.length, 20); assert(times.slice(1).every((time, i) => time.at - times[i].at >= 450 && time.at - times[i].at < 800), JSON.stringify(times));
    evidence.checks.push({ name: 'native-reveal-timing', times });
    await output.webContents.executeJavaScript("[...document.querySelectorAll('.lottery-pagination button')].find(b=>b.textContent.includes('이전')).click()");
    for (const [width, height] of [[1440, 900], [1920, 1080]]) await capture(output, `lottery-six-winners-${width}.png`, width, height);
    await send('layout', { layout: 'center' });
    await capture(output, 'lottery-six-winners-390.png', 390, 844);
    const media = await output.webContents.executeJavaScript(`Promise.all(['rolling','ball','tada'].map(name=>new Promise((resolve,reject)=>{const media=new Audio('/assets/lottery/'+name+'.wav');media.volume=0;media.onloadedmetadata=()=>media.play().then(()=>{resolve({name,duration:media.duration,playing:!media.paused});media.pause()}).catch(reject);media.onerror=reject;})))`);
    assert(media.every(item => item.playing && item.duration > 0)); evidence.checks.push({ name: 'audio-decoding-muted', media });
    output.webContents.reload();
    await wait(() => output.webContents.executeJavaScript("document.querySelector('.lottery-footer')?.textContent.includes('확정 당첨자 20명')"), 'saved reveal cursor');
    evidence.checks.push({ name: 'renderer-reconnect-keeps-confirmed-cursor', passed: true });
    source.close();
    await wait(async () => !(await read()).state.sourceConnected, 'source disconnect');
    assert.equal((await read()).state.lottery.revealedCount, 20);
    await capture(output, 'lottery-disconnected-390.png', 390, 844);
    await controller.webContents.executeJavaScript('scrollTo(0,0)');
    await capture(controller, 'controller-390.png', 390, 844);
    await capture(controller, 'controller-ipad-layout-1024.png', 1024, 768);
    evidence.checks.push({ name: 'source-disconnect-retains-real-confirmed-result', passed: true });
    fs.writeFileSync(path.join(directory, 'checks.json'), JSON.stringify(evidence, null, 2));
    console.log('NATIVE_REHEARSAL_PASS: editor persistence, private operator projection, real video decoding, 20 confirmed winners and 500ms sequence, 390/1440/1920 fit, muted audio decoding, reconnect');
    app.exit(0);
  } catch (error) { console.error(error); source?.close(); fs.writeFileSync(path.join(directory, 'checks-partial.json'), JSON.stringify(evidence, null, 2)); app.exit(1); }
})();
