const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (settings) => ipcRenderer.invoke('settings:save', settings),
  saveGithubTarget: (owner, repo) => ipcRenderer.invoke('settings:saveGithubTarget', { owner, repo }),
  listOwners: () => ipcRenderer.invoke('github:listOwners'),
  listRepos: (owner, type) => ipcRenderer.invoke('github:listRepos', { owner, type }),
  listReleases: (owner, repo) => ipcRenderer.invoke('github:listReleases', { owner, repo }),
  getRelease: (owner, repo, tag) => ipcRenderer.invoke('github:getRelease', { owner, repo, tag }),
  checkGithubAuth: () => ipcRenderer.invoke('github:checkAuth'),
  loadAzureMetadata: (config) => ipcRenderer.invoke('azure:loadMetadata', config),
  sendToTeams: (webhookUrl, text) => ipcRenderer.invoke('teams:send', { webhookUrl, text }),
  generateChangelog: (params) => ipcRenderer.invoke('generate:changelog', params),
  copyToClipboard: (text) => ipcRenderer.invoke('clipboard:write', text),
  exportFile: (text, defaultName) => ipcRenderer.invoke('file:export', { text, defaultName }),
});
