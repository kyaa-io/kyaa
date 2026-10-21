const { contextBridge, ipcRenderer } = require("electron");
const api = {};
for (const [key, channel] of Object.entries({
  getSetup: "setup",
  selectDisplay: "display",
  openSource: "source",
  openCertificate: "certificate",
  importShow: "import",
  setSourceOrigin: "origin",
  readContent: "read-content",
  saveContent: "save-content",
}))
  api[key] = (value) => ipcRenderer.invoke(channel, value);
api.reportMedia = (value) => ipcRenderer.send("media", value);
api.reportLotteryCursor = (value) => ipcRenderer.send('lottery-cursor', value);
api.onSetup = (callback) => {
  const handler = (_, v) => callback(v);
  ipcRenderer.on("setup", handler);
  return () => ipcRenderer.removeListener("setup", handler);
};
contextBridge.exposeInMainWorld(
  "stageNative",
  new URL(location.href).searchParams.get("surface") === "audience"
    ? { reportMedia: api.reportMedia, reportLotteryCursor: api.reportLotteryCursor }
    : api,
);
