const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("roleSwitch", {
  getState: () => ipcRenderer.invoke("state:get"),
  saveState: (state) => ipcRenderer.invoke("state:save", state),
  activate: (id) => ipcRenderer.invoke("profile:activate", id),
  createProfile: (name, color) => ipcRenderer.invoke("profile:create", { name, color }),
  launch: (id, agent) => ipcRenderer.invoke("agent:launch", { id, agent }),
  chooseFolder: () => ipcRenderer.invoke("folder:choose"),
  openFolder: (target) => ipcRenderer.invoke("folder:open", target),
  getUsage: (id) => ipcRenderer.invoke("usage:get", id),
  installTerminal: () => ipcRenderer.invoke("terminal:install")
});
