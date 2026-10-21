const { app, BrowserWindow } = require("electron");
const fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict");
const outputDir = process.env.KYAA_SMOKE_DIR;
if (!outputDir) throw Error("KYAA_SMOKE_DIR required");
fs.mkdirSync(outputDir, { recursive: true });
app.setPath("userData", path.join(outputDir, "test-profile"));
const wait = async (predicate) => {
  for (let i = 0; i < 100; i++) {
    const result = await predicate();
    if (result) return result;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw Error("Timed out");
};
let controller, output;
app.on("browser-window-created", (_event, win) => {
  win.webContents.on("did-finish-load", () => {
    if (win.webContents.getURL().includes("surface=audience")) output = win;
    else if (win.webContents.getURL().startsWith("http://127.0.0.1:"))
      controller = win;
  });
});
require("../dist-native/main.cjs");
(async () => {
  try {
    await wait(() => controller && output);
    await wait(() =>
      controller.webContents.executeJavaScript(
        "document.body.innerText.includes('컨트롤러 연결됨')",
      ),
    );
    const setup = await controller.webContents.executeJavaScript(
      "window.stageNative.getSetup()",
    );
    assert(setup.displays.length);
    assert(setup.qrDataUrls.length);
    await controller.webContents.executeJavaScript(
      `window.stageNative.selectDisplay(${JSON.stringify(setup.displays[0].id)})`,
    );
    await wait(() => output.isVisible());
    assert.equal(
      await output.webContents.executeJavaScript(
        "typeof window.stageNative.getSetup",
      ),
      "undefined",
    );
    await wait(() =>
      controller.webContents.executeJavaScript(
        "!!document.querySelector('.preview img')",
      ),
    );
    fs.writeFileSync(
      path.join(outputDir, "native-controller.png"),
      (await controller.capturePage()).toPNG(),
    );
    fs.writeFileSync(
      path.join(outputDir, "native-audience.png"),
      (await output.capturePage()).toPNG(),
    );
    const initial = await controller.webContents.executeJavaScript(
      "fetch('/api/state').then(r=>r.json())",
    );
    const video = initial.manifest.cues.find((c) => c.type === "video");
    assert(video);
    const send = async (action, values = {}) =>
      controller.webContents.executeJavaScript(
        `(async()=>{const {state}=await fetch('/api/state').then(r=>r.json());const ws=new WebSocket('ws://'+location.host+'/ws');return new Promise((resolve,reject)=>{ws.onopen=()=>ws.send(JSON.stringify({type:'command',id:crypto.randomUUID(),revision:state.revision,action:${JSON.stringify(action)},...${JSON.stringify(values)}}));ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.type==='ack'){ws.close();resolve(m);}};ws.onerror=reject;});})()`,
      );
    assert((await send("goto", { cueId: video.id })).ok);
    await wait(() =>
      output.webContents.executeJavaScript("!!document.querySelector('video')"),
    );
    await wait(() =>
      output.webContents.executeJavaScript(
        "document.querySelector('video')?.currentTime>0.5",
      ),
    );
    output.close();
    await wait(() =>
      controller.webContents.executeJavaScript(
        "fetch('/api/state').then(r=>r.json()).then(x=>!x.state.outputConnected&&!x.state.media.playing)",
      ),
    );
    await wait(() =>
      output.webContents.executeJavaScript(
        "document.querySelector('video')?.paused",
      ),
    );
    await controller.webContents.executeJavaScript(
      `window.stageNative.selectDisplay(${JSON.stringify(setup.displays[0].id)})`,
    );
    await output.webContents.executeJavaScript(
      "document.querySelector('video').currentTime=document.querySelector('video').duration-0.2",
    );
    await send("media", { operation: "play" });
    await wait(() =>
      controller.webContents.executeJavaScript(
        `fetch('/api/state').then(r=>r.json()).then(x=>x.state.cueId===${JSON.stringify(video.nextOnEnd)})`,
      ),
    );
    const htmlVideo=initial.manifest.cues.find(c=>c.type==='html'&&c.slideIndex===3);
    assert(htmlVideo);await send('goto',{cueId:htmlVideo.id});
    await wait(()=>output.webContents.executeJavaScript("Array.from(document.querySelector('iframe')?.contentDocument?.querySelectorAll('.slide video')||[]).some(v=>!v.paused&&v.currentTime>0.5)"));
    const live = initial.manifest.cues.find((c) => c.type === "live");
    await send("goto", { cueId: live.id });
    await send("scene", { scene: "explorer" });
    await wait(() =>
      output.contentView.children.some((v) => v.webContents && v.getVisible()),
    );
    await wait(() =>
      output.webContents.executeJavaScript(
        "!!document.querySelector('.audience-live.scene-explorer')",
      ),
    );
    const explorer = output.contentView.children.find((v) =>
      v.webContents?.getURL().includes("sepolia-explorer.giwa.io"),
    );
    assert(explorer);
    await wait(() => !explorer.webContents.isLoading());
    await wait(() =>
      explorer.webContents.executeJavaScript(
        "document.body.innerText.includes('Contract')||document.body.innerText.includes('Address')",
      ),
    );
    fs.writeFileSync(
      path.join(outputDir, "native-explorer.png"),
      (await explorer.webContents.capturePage()).toPNG(),
    );
    const prior = await controller.webContents.executeJavaScript(
      "document.querySelector('.preview img').src",
    );
    await wait(() =>
      controller.webContents.executeJavaScript(
        `document.querySelector('.preview img').src!==${JSON.stringify(prior)}`,
      ),
    );
    const data = await controller.webContents.executeJavaScript(
      "document.querySelector('.preview img').src",
    );
    fs.writeFileSync(
      path.join(outputDir, "native-preview.jpg"),
      Buffer.from(data.split(",")[1], "base64"),
    );
    await send("goto", { cueId: initial.manifest.cues[0].id });
    console.log(
      "NATIVE_SMOKE_PASS: paired native windows, QR, output selection, private IPC isolation, preview, video and HTML cue autoplay/output-loss pause/end advance, explorer view",
    );
    app.exit(0);
  } catch (e) {
    console.error(e);
    app.exit(1);
  }
})();
