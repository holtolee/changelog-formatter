const path = require('path');
const { fileURLToPath } = require('url');
const { app, BrowserWindow, ipcMain, clipboard, dialog } = require('electron');
const fs = require('fs/promises');

const { getSettings, saveSettings, saveGithubTarget } = require('./settings');
const github = require('../src/github');
const {
  fetchWorkItemWithAncestors,
  fetchAreaPaths,
  fetchWorkItemTypes,
} = require('../src/azureDevOps');
const { parseWhatsChanged } = require('../src/parser');
const { buildChangelogText } = require('../src/formatter');
const { sendToTeams } = require('../src/teams');

const INDEX_PATH = path.join(__dirname, '..', 'src', 'index.html');

function isAppFrame(frame) {
  if (!frame) return false;
  try {
    const url = new URL(frame.url);
    url.hash = '';
    url.search = '';
    const senderPath = fileURLToPath(url);
    return process.platform === 'win32'
      ? senderPath.toLowerCase() === INDEX_PATH.toLowerCase()
      : senderPath === INDEX_PATH;
  } catch {
    return false;
  }
}

// N'accepte les appels IPC que depuis l'interface de l'app : une autre page (fichier déposé
// sur la fenêtre, lien suivi…) ne doit pas pouvoir lire les secrets exposés par le preload.
function handle(channel, listener) {
  ipcMain.handle(channel, (event, ...args) => {
    if (!isAppFrame(event.senderFrame)) throw new Error(`Appel IPC "${channel}" refusé : origine inconnue.`);
    return listener(event, ...args);
  });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 880,
    minWidth: 760,
    minHeight: 600,
    backgroundColor: '#07030f',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  // L'app n'a qu'une page : on bloque toute navigation et ouverture de fenêtre.
  win.webContents.on('will-navigate', (event) => event.preventDefault());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.loadFile(INDEX_PATH);
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

handle('settings:get', () => getSettings());
handle('settings:save', (_evt, settings) => saveSettings(settings));
handle('settings:saveGithubTarget', (_evt, target) => saveGithubTarget(target));

handle('github:listOwners', async () => {
  return github.listOwners();
});

handle('github:listRepos', async (_evt, { owner, type }) => {
  return github.listRepos(owner, type);
});

handle('github:listReleases', async (_evt, { owner, repo }) => {
  return github.listReleases(owner, repo);
});

handle('github:getRelease', async (_evt, { owner, repo, tag }) => {
  return github.getReleaseByTag(owner, repo, tag);
});

handle('github:checkAuth', async () => {
  return github.checkAuth();
});

handle('azure:loadMetadata', async (_evt, { azureOrg, azureProject, azureToken }) => {
  const config = { org: azureOrg, project: azureProject, token: azureToken };
  const [areas, workItemTypes] = await Promise.all([
    fetchAreaPaths(config),
    fetchWorkItemTypes(config),
  ]);
  return { areas, workItemTypes };
});

async function fetchAllWorkItems(ids, azureConfig, concurrency = 5) {
  const cache = new Map();
  const queue = [...ids];
  const workers = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
    while (queue.length) {
      const id = queue.shift();
      await fetchWorkItemWithAncestors(id, azureConfig, cache);
    }
  });
  await Promise.all(workers);
  return cache;
}

handle('generate:changelog', async (_evt, params) => {
  const {
    body,
    owner,
    repo,
    version,
    azureOrg,
    azureProject,
    azureToken,
    teamMapping,
    typeMapping,
  } = params;

  const entries = parseWhatsChanged(body, { owner, repo });
  const ticketIds = [...new Set(entries.filter((e) => e.ticket).map((e) => Number(e.ticket)))];

  const workItemCache = await fetchAllWorkItems(ticketIds, {
    org: azureOrg,
    project: azureProject,
    token: azureToken,
  });

  const text = buildChangelogText({
    version,
    entries,
    workItemCache,
    teamMapping,
    typeMapping,
    azureOrgVs: azureOrg,
    azureProject,
  });

  return { text, debug: entries };
});

handle('teams:send', async (_evt, { webhookUrl, text }) => {
  await sendToTeams(webhookUrl, text);
  return { sent: true };
});

handle('clipboard:write', (_evt, text) => {
  clipboard.writeText(text);
  return true;
});

handle('file:export', async (_evt, { text, defaultName }) => {
  const { canceled, filePath } = await dialog.showSaveDialog({
    defaultPath: defaultName || 'changelog.txt',
    filters: [
      { name: 'Texte', extensions: ['txt', 'md'] },
      { name: 'Tous les fichiers', extensions: ['*'] },
    ],
  });
  if (canceled || !filePath) return { saved: false };
  await fs.writeFile(filePath, text, 'utf8');
  return { saved: true, filePath };
});
