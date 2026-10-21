import {
  app,
  BrowserWindow,
  WebContentsView,
  ipcMain,
  screen,
  shell,
  dialog,
  nativeImage,
} from "electron";
import fs from "node:fs";
import { X509Certificate } from "node:crypto";
import path from "node:path";
import http from "node:http";
import QRCode from "qrcode";
import { certificate, addresses } from "./certificate.mjs";
import { startServer, safeFile } from "./server.mjs";
import { initialState, mediaReport } from "./state.mjs";
import { manifestSchema } from "./manifest.mjs";
import { loadContentEdits, applyContentEdits, saveContentEdits } from "./content-edits.mjs";
import { stageHostProjectionSchema } from "../../web/features/wave-stage/domain/stage-host-projection.ts";
import { WAVE_PRIZES } from "../../web/features/fanpage/domain/wave-draw.ts";
import { reduceLottery } from '../src/lottery-state.js';
const EXPLORER =
  "https://sepolia-explorer.giwa.io/address/0xb6c5F48d770A732dEb374226EDa1E5Be209B7ED4?tab=internal_txns";
let controller,
  output,
  host,
  state,
  manifest,
  originalManifest,
  contentEdits,
  views = {},
  selectedDisplayId,
  qrDataUrls = [],
  sourceOrigin = "https://kyaa.io",
  bundle,
  savedPath,
  certServer,
  certificateFingerprint;
const base = process.env.KYAA_APP_ROOT || app.getAppPath();
const sourceUrl = () =>
  `${sourceOrigin}/admin/wave-stage#stage-host=${encodeURIComponent(`ws://127.0.0.1:${host.localPort}/source?token=${host.sourceToken}`)}`;
const setup = () => ({
  controllerUrls: state.networkUrls,
  certificateUrls: addresses().map(
    (ip) => `http://${ip}:${certServer.address().port}/certificate.cer`,
  ),
  qrDataUrls,
  certificateFingerprint,
  certificatePath: path.join(
    app.getPath("userData"),
    "tls",
    "KYAA-Stage-CA.cer",
  ),
  sourceUrl: sourceUrl(),
  displays: screen.getAllDisplays().map((d) => ({
    id: String(d.id),
    label: `${d.label || "디스플레이"} · ${d.size.width}×${d.size.height}`,
  })),
  selectedDisplayId: String(selectedDisplayId ?? ""),
});
function persist(value) {
  const temporary = savedPath + ".tmp";
  fs.writeFileSync(temporary, JSON.stringify(value), { mode: 0o600 });
  fs.renameSync(temporary, savedPath);
}
function save() {
  persist({ cueId: state.cueId, sourceOrigin, bundle, operatorJournal: state.operatorJournal, lottery: state.lottery });
}
function arrange() {
  if (!output || output.isDestroyed()) return;
  const [width, height] = output.getContentSize(),
    live = manifest.cues.find((c) => c.id === state.cueId)?.type === "live";
  for (const [name, view] of Object.entries(views)) {
    const healthy =
      name === "explorer" ||
      (view.streamPlaying &&
        state.sourceConnected &&
        !state.projection?.tiktokFailed &&
        Date.now() - state.sourceUpdatedAt < 90000 &&
        state.projection?.tiktok?.creators.some(
          (c) =>
            c.slug === name &&
            c.state === "live" &&
            Date.now() - Date.parse(c.observedAt) < 90000,
        ));
    const visible =
      state.outputConnected &&
      live &&
      healthy &&
      !view.loadFailed &&
      (name === "explorer"
        ? state.scene === "explorer"
        : state.scene !== "explorer" &&
          (state.layout === "triptych" ||
            (state.layout === "performance" && name === "wena")));
    view.setVisible(visible);
    const full = name === "explorer" || state.layout === "performance",
      w = full ? width : Math.round(width * 0.2);
    view.setBounds({
      x: full || name === "changha" ? 0 : width - w,
      y: 0,
      width: w,
      height,
    });
    view.webContents.setAudioMuted(
      !visible || state.audio !== name || state.media.playing || (['draw', 'results'].includes(state.scene) && state.lottery?.phase !== 'prize'),
    );
  }
}
function freezeOutput() {
  state.outputConnected = false;
  state.media.playing = false;
  state.audio = "none";
  state.revision++;
  host.broadcast({
    type: "media-command",
    cueId: state.cueId,
    operation: "pause",
  });
  host.publish();
}
function effect(e) {
  arrange();
  if (
    e.action !== "explorer" ||
    state.scene !== "explorer" ||
    manifest.cues.find((c) => c.id === state.cueId)?.type !== "live"
  )
    return;
  const v = views.explorer,
    wc = v.webContents;
  if (e.operation === "return") void wc.loadURL(EXPLORER);
  if (e.operation === "back" && wc.navigationHistory.canGoBack())
    wc.navigationHistory.goBack();
  if (["click", "scroll"].includes(e.operation)) {
    output.focus();
    wc.focus();
    const b = v.getBounds();
    if (e.operation === "click") {
      const pos = {
        x: Math.round(e.x * (b.width - 1)),
        y: Math.round(e.y * (b.height - 1)),
        button: "left",
        clickCount: 1,
      };
      wc.sendInputEvent({ type: "mouseDown", ...pos });
      wc.sendInputEvent({ type: "mouseUp", ...pos });
    } else
      wc.sendInputEvent({
        type: "mouseWheel",
        x: Math.round(b.width / 2),
        y: Math.round(b.height / 2),
        deltaX: 0,
        deltaY: -e.deltaY,
        canScroll: true,
      });
  }
}
function trusted(event, audience = false) {
  const wc = event.sender;
  if (
    event.senderFrame !== wc.mainFrame ||
    !(audience
      ? wc === output?.webContents
      : wc === controller?.webContents) ||
    new URL(event.senderFrame.url).origin !==
      `http://127.0.0.1:${host.localPort}`
  )
    throw Error("untrusted caller");
}
function external(name, url) {
  const v = new WebContentsView({
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      partition: `persist:stage-${name}`,
      backgroundThrottling: false,
      autoplayPolicy: "no-user-gesture-required",
    },
  });
  output.contentView.addChildView(v);
  v.stageUrl = url;
  v.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  v.webContents.session.setPermissionRequestHandler((_w, _p, cb) => cb(false));
  v.webContents.on("will-navigate", (e, target) => {
    const u = new URL(target);
    if (
      u.protocol !== "https:" ||
      !(name === "explorer"
        ? u.hostname === "sepolia-explorer.giwa.io"
        : ["www.tiktok.com", "tiktok.com"].includes(u.hostname))
    )
      e.preventDefault();
  });
  const permitted = (target) => {
    const u = new URL(target),
      expected = new URL(url);
    return (
      u.origin === expected.origin &&
      (name === "explorer" || u.pathname === expected.pathname)
    );
  };
  for (const eventName of ["will-navigate", "will-redirect"])
    v.webContents.on(eventName, (e, target) => {
      if (!permitted(target)) {
        e.preventDefault();
        v.loadFailed = true;
        arrange();
      }
    });
  v.webContents.on("did-fail-load", () => {
    v.loadFailed = true;
    arrange();
  });
  v.webContents.on("did-finish-load", () => {
    v.loadFailed = false;
    if (name !== "explorer") {
      void v.webContents.insertCSS("html,body{background:#07131d!important;overflow:hidden!important}body>*{visibility:hidden!important}video{visibility:visible!important;position:fixed!important;inset:0!important;width:100vw!important;height:100vh!important;object-fit:contain!important;z-index:2147483647!important}");
    }
    arrange();
  });
  v.webContents.on("render-process-gone", () => {
    v.loadFailed = true;
    arrange();
  });
  v.webContents.setAudioMuted(true);
  void v.webContents.loadURL(url).catch(() => {});
  v.setVisible(false);
  return v;
}
async function network() {
  state.networkUrls = addresses().map(
    (ip) => `https://${ip}:${host.lanPort}/#pair=${host.pairToken}`,
  );
  qrDataUrls = await Promise.all(
    state.networkUrls.map(async (url) => ({
      url,
      data: await QRCode.toDataURL(url, { width: 220, margin: 1 }),
    })),
  );
  host.publish();
  controller?.webContents.send("setup", setup());
}
async function start() {
  if (!app.requestSingleInstanceLock()) {
    app.quit();
    return;
  }
  app.on("second-instance", () => controller?.focus());
  await app.whenReady();
  try {
    savedPath = path.join(app.getPath("userData"), "stage-state.json");
    let saved = {};
    try {
      saved = JSON.parse(fs.readFileSync(savedPath, "utf8"));
    } catch {}
    bundle = process.env.KYAA_SHOW || saved.bundle || path.join(base, "show");
    originalManifest = manifestSchema.parse(
      JSON.parse(fs.readFileSync(path.join(bundle, "manifest.json"), "utf8")),
    );
    contentEdits = await loadContentEdits(app.getPath("userData"), originalManifest);
    manifest = applyContentEdits(originalManifest, contentEdits);
    for (const cue of manifest.cues) {
      if (cue.asset) safeFile(bundle, cue.asset);
      if (cue.thumbnail) safeFile(bundle, cue.thumbnail);
    }
    if (saved.sourceOrigin) sourceOrigin = saved.sourceOrigin;
    state = initialState(manifest, saved);
    const tls = certificate(path.join(app.getPath("userData"), "tls"));
    certificateFingerprint = new X509Certificate(tls.ca).fingerprint256;
    certServer = http.createServer((req, res) => {
      if (req.url !== "/certificate.cer") {
        res.writeHead(404);
        return res.end();
      }
      res.writeHead(200, {
        "Content-Type": "application/x-x509-ca-cert",
        "Content-Disposition": "attachment; filename=KYAA-Stage-CA.cer",
      });
      fs.createReadStream(tls.caPath).pipe(res);
    });
    await new Promise((r) => certServer.listen(0, "0.0.0.0", r));
    host = await startServer({
      state,
      manifest,
      bundle,
      frontend: path.join(base, "dist"),
      tls,
      validateProjection: (p) => stageHostProjectionSchema.parse(p),
      onEffect: effect,
      onChange: () => {
        save();
        arrange();
      },
      setup: () => ({ controllerUrls: state.networkUrls }),
      sourceOrigin: () => sourceOrigin,
      onsitePrizes: WAVE_PRIZES,
    });
    await network();
    const preferences = {
      preload: path.join(base, "dist-native", "preload.cjs"),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      autoplayPolicy: "no-user-gesture-required",
    };
    const operatorDisplay =
        screen.getAllDisplays().find((d) => d.internal) ||
        screen.getPrimaryDisplay(),
      area = operatorDisplay.workArea;
    controller = new BrowserWindow({
      x: area.x,
      y: area.y,
      width: Math.min(1250, area.width),
      height: Math.min(900, area.height),
      show: false,
      title: "KYAA Stage · 조작",
      webPreferences: { ...preferences, partition: "stage-controller" },
    });
    output = new BrowserWindow({
      width: 1280,
      height: 720,
      show: false,
      title: "KYAA Stage · 출력",
      backgroundColor: "#07131d",
      webPreferences: { ...preferences, partition: "stage-audience", backgroundThrottling: false },
    });
    for (const w of [controller, output]) {
      w.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
      w.webContents.on("will-navigate", (e, url) => {
        if (new URL(url).origin !== `http://127.0.0.1:${host.localPort}`)
          e.preventDefault();
      });
    }
    const local = `http://127.0.0.1:${host.localPort}`;
    const choose = (id) => {
      const d = screen
        .getAllDisplays()
        .find((d) => String(d.id) === String(id));
      if (!d) throw Error("디스플레이를 찾을 수 없습니다.");
      selectedDisplayId = d.id;
      output.setFullScreen(false);
      output.setBounds(d.bounds);
      output.show();
      output.setFullScreen(screen.getAllDisplays().length > 1);
      state.outputConnected = true;
      host.publish();
      return setup();
    };
    ipcMain.handle("setup", (e) => {
      trusted(e);
      return setup();
    });
    ipcMain.handle("read-content", (e, cueId) => {
      trusted(e);
      const cue = manifest.cues.find((item) => item.id === cueId);
      if (!cue) throw Error("편집할 화면을 찾을 수 없습니다.");
      return { version: contentEdits.version, cue };
    });
    ipcMain.handle("save-content", async (e, input) => {
      trusted(e);
      contentEdits = await saveContentEdits(app.getPath("userData"), originalManifest, input);
      Object.assign(manifest, applyContentEdits(originalManifest, contentEdits));
      state.revision++;
      host.publishManifest();
      return { version: contentEdits.version, cue: manifest.cues.find((item) => item.id === input.cueId) };
    });
    ipcMain.handle("display", (e, id) => {
      trusted(e);
      return choose(id);
    });
    ipcMain.handle("source", (e) => {
      trusted(e);
      return shell.openExternal(sourceUrl());
    });
    ipcMain.handle("certificate", (e) => {
      trusted(e);
      shell.showItemInFolder(tls.caPath);
    });
    ipcMain.handle("origin", (e, value) => {
      trusted(e);
      const u = new URL(value);
      if (
        u.username ||
        u.password ||
        u.pathname !== "/" ||
        u.search ||
        u.hash ||
        !(
          (u.protocol === "https:" && u.hostname === "kyaa.io") ||
          (u.protocol === "http:" &&
            ["localhost", "127.0.0.1"].includes(u.hostname))
        )
      )
        throw Error("kyaa.io 또는 로컬 개발 서버 주소를 입력하세요.");
      sourceOrigin = u.origin;
      host.disconnectSource();
      save();
      return setup();
    });
    ipcMain.handle("import", async (e) => {
      trusted(e);
      const result = await dialog.showOpenDialog(controller, {
        title: "변환된 show 폴더 선택",
        properties: ["openDirectory"],
      });
      if (result.canceled) return;
      const from = result.filePaths[0],
        next = manifestSchema.parse(
          JSON.parse(fs.readFileSync(path.join(from, "manifest.json"), "utf8")),
        );
      for (const cue of next.cues) {
        if (cue.asset) safeFile(from, cue.asset);
        if (cue.thumbnail) safeFile(from, cue.thumbnail);
      }
      bundle = from;
      persist({ bundle, sourceOrigin });
      app.relaunch();
      app.quit();
    });
    ipcMain.on("media", (e, report) => {
      try {
        trusted(e, true);
        if (state.outputConnected && mediaReport(state, manifest, report))
          host.publish();
      } catch {}
    });
    ipcMain.on('lottery-cursor', (e, report) => {
      try {
        trusted(e, true);
        if (!state.outputConnected) return;
        reduceLottery(state, { operation: 'cursor', sequenceKey: report.sequenceKey, count: report.count }, WAVE_PRIZES);
        host.publish();
      } catch {}
    });
    await controller.loadURL(`${local}/#pair=${host.pairToken}`);
    await output.loadURL(`${local}/?surface=audience#pair=${host.audienceToken}`);
    views = {
      changha: external("changha", "https://www.tiktok.com/@chang._.a/live"),
      wena: external("wena", "https://www.tiktok.com/@wena_official_/live"),
      explorer: external("explorer", EXPLORER),
    };
    controller.show();
    output.on("resize", arrange);
    output.on("close", (e) => {
      if (!app.isQuitting) {
        e.preventDefault();
        output.hide();
        freezeOutput();
      }
    });
    screen.on("display-removed", () => {
      if (!screen.getAllDisplays().some((d) => d.id === selectedDisplayId)) {
        output.hide();
        selectedDisplayId = undefined;
        freezeOutput();
        controller.webContents.send("setup", setup());
      }
    });
    screen.on("display-added", () =>
      controller.webContents.send("setup", setup()),
    );
    let capturing = false;
    const frames = setInterval(async () => {
      if (
        capturing ||
        !output ||
        output.isDestroyed() ||
        !state.outputConnected
      )
        return;
      capturing = true;
      try {
        const image = await output.capturePage(),
          small = image.resize({ width: 960 }),
          size = small.getSize(),
          bitmap = small.toBitmap(),
          scale = 960 / output.getContentSize()[0];
        for (const view of Object.values(views)) {
          if (!view.getVisible()) continue;
          const bounds = view.getBounds(),
            w = Math.round(bounds.width * scale),
            h = size.height,
            x = Math.round(bounds.x * scale);
          const layer = (await view.webContents.capturePage())
            .resize({ width: w, height: h })
            .toBitmap();
          for (let row = 0; row < h; row++)
            layer.copy(
              bitmap,
              (row * size.width + x) * 4,
              row * w * 4,
              (row + 1) * w * 4,
            );
        }
        const composite = nativeImage.createFromBitmap(bitmap, size);
        host.broadcast({
          type: "frame",
          target: "output",
          data: `data:image/jpeg;base64,${composite.toJPEG(60).toString("base64")}`,
        });
      } catch {
      } finally {
        capturing = false;
      }
    }, 800);
    const streamMonitor = setInterval(async () => {
      for (const name of ["changha", "wena"]) {
        const v = views[name];
        try {
          const liveNow = state.sourceConnected && !state.projection?.tiktokFailed && Date.now() - state.sourceUpdatedAt < 90000 && state.projection?.tiktok?.creators.some((creator) => creator.slug === name && creator.state === "live" && Date.now() - Date.parse(creator.observedAt) < 90000);
          if (liveNow && !v.streamPlaying && Date.now() - (v.lastReloadAt || 0) > 30000) {
            v.lastReloadAt = Date.now();
            void v.webContents.loadURL(v.stageUrl).catch(() => {});
          }
          const audible = state.audio === "changha" && name === "changha" && v.getVisible() && !state.media.playing;
          v.streamPlaying = await v.webContents.executeJavaScript(
            `(()=>{const video=document.querySelector('video');if(!video)return false;video.muted=${!audible};video.volume=0.25;if(video.paused&&!video.ended&&video.readyState>=2)video.play().catch(()=>{});return !video.ended&&!video.paused&&video.readyState>=2;})()`,
          );
        } catch {
          v.streamPlaying = false;
        }
      }
      arrange();
    }, 1500);
    let networkKey = addresses().join(",");
    const networking = setInterval(() => {
      const key = addresses().join(",");
      if (key !== networkKey) {
        networkKey = key;
        try {
          host.lan.setSecureContext(
            certificate(path.join(app.getPath("userData"), "tls")),
          );
          void network();
        } catch (e) {
          state.error = e.message;
          host.publish();
        }
      }
    }, 10000);
    controller.on("closed", () => app.quit());
    app.on("before-quit", () => {
      app.isQuitting = true;
      clearInterval(frames);
      clearInterval(networking);
      clearInterval(streamMonitor);
      host.close();
      certServer.close();
      for (const v of Object.values(views)) v.webContents.close();
    });
    console.log(`KYAA_LOCAL_URL=${local}/#pair=${host.pairToken}`);
  } catch (error) {
    dialog.showErrorBox("KYAA Stage 시작 실패", error.message);
    app.quit();
  }
}
void start();
