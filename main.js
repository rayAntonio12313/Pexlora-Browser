'use strict';

const { app, BrowserWindow, WebContentsView, ipcMain, session, shell, dialog } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const APP_NAME = 'Pexlora Browser';
const DEFAULT_SETTINGS = {
  searchEngine: 'google',
  shieldsEnabled: true,
  showHomeOnStartup: true
};
const TRACKER_HOSTS = [
  'doubleclick.net',
  'googlesyndication.com',
  'google-analytics.com',
  'googletagmanager.com',
  'connect.facebook.net',
  'facebook.com/tr',
  'hotjar.com',
  'clarity.ms',
  'scorecardresearch.com',
  'adservice.google.com',
  'amazon-adsystem.com',
  'criteo.com'
];

let mainWindow;
let nextTabId = 1;
let activeTabId = null;
let chromeHeight = 88;
let sidePanelWidth = 0;
let regularSession;
let privateSession;
let regularHooksInstalled = false;
let privateHooksInstalled = false;
let saveTimer;
let data = {
  settings: { ...DEFAULT_SETTINGS },
  bookmarks: [],
  history: [],
  downloads: []
};
const tabs = new Map();

function dataPath() {
  return path.join(app.getPath('userData'), 'pexlora-data.json');
}

function loadData() {
  try {
    const raw = fs.readFileSync(dataPath(), 'utf8');
    const parsed = JSON.parse(raw);
    data = {
      settings: { ...DEFAULT_SETTINGS, ...(parsed.settings || {}) },
      bookmarks: Array.isArray(parsed.bookmarks) ? parsed.bookmarks : [],
      history: Array.isArray(parsed.history) ? parsed.history : [],
      downloads: Array.isArray(parsed.downloads) ? parsed.downloads : []
    };
  } catch {
    data = { settings: { ...DEFAULT_SETTINGS }, bookmarks: [], history: [], downloads: [] };
  }
}

function saveData() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      fs.mkdirSync(path.dirname(dataPath()), { recursive: true });
      const persistent = {
        settings: data.settings,
        bookmarks: data.bookmarks,
        history: data.history.slice(0, 1000),
        downloads: data.downloads.slice(0, 100)
      };
      fs.writeFileSync(dataPath(), JSON.stringify(persistent, null, 2), 'utf8');
    } catch (error) {
      console.error('Não foi possível salvar os dados do Pexlora:', error);
    }
  }, 120);
}

function safeSend(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

function getHost(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
}

function getSearchUrl(value) {
  const query = String(value || '').trim();
  if (!query) return null;
  try {
    const url = new URL(query);
    if (url.protocol === 'http:' || url.protocol === 'https:') return url.toString();
  } catch { /* treat as a search or host name */ }

  if (/^(localhost|127\.0\.0\.1)(:\d+)?(\/.*)?$/i.test(query)) {
    return `http://${query}`;
  }
  if (/^[a-z0-9-]+(\.[a-z0-9-]+)+(\/.*)?$/i.test(query) && !/\s/.test(query)) {
    return `https://${query}`;
  }

  const encoded = encodeURIComponent(query);
  return data.settings.searchEngine === 'duckduckgo'
    ? `https://duckduckgo.com/?q=${encoded}`
    : `https://www.google.com/search?q=${encoded}`;
}

function isSafeWebUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function addHistory(url, title, isPrivate) {
  if (isPrivate || !isSafeWebUrl(url)) return;
  const entry = { url, title: title || getHost(url) || url, visitedAt: Date.now() };
  data.history.unshift(entry);
  if (data.history.length > 1000) data.history.length = 1000;
  saveData();
}

function getPublicState() {
  const tabList = [...tabs.values()].map((tab) => ({
    id: tab.id,
    title: tab.title || (tab.home ? 'Nova guia' : getHost(tab.url) || 'Carregando…'),
    url: tab.url || '',
    home: Boolean(tab.home),
    private: Boolean(tab.isPrivate),
    loading: Boolean(tab.loading),
    canGoBack: Boolean(tab.view && !tab.view.webContents.isDestroyed() && tab.view.webContents.canGoBack()),
    canGoForward: Boolean(tab.view && !tab.view.webContents.isDestroyed() && tab.view.webContents.canGoForward())
  }));
  return {
    appName: APP_NAME,
    tabs: tabList,
    activeTabId,
    settings: data.settings,
    bookmarks: data.bookmarks,
    history: data.history,
    downloads: data.downloads,
    trackerBlockListSize: TRACKER_HOSTS.length
  };
}

function broadcastState() {
  safeSend('browser:state', getPublicState());
  updateWindowTitle();
}

function updateWindowTitle() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const tab = tabs.get(activeTabId);
  const title = tab && !tab.home ? `${tab.title || getHost(tab.url)} — Pexlora` : 'Pexlora Browser';
  mainWindow.setTitle(title);
}

function currentTab() {
  return tabs.get(activeTabId) || null;
}

function arrangeViews() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const [width, height] = mainWindow.getContentSize();
  const viewWidth = Math.max(0, width - sidePanelWidth);
  const viewHeight = Math.max(0, height - chromeHeight);

  for (const tab of tabs.values()) {
    const shouldShow = tab.id === activeTabId && !tab.home;
    tab.view.setBounds({
      x: 0,
      y: chromeHeight,
      width: viewWidth,
      height: viewHeight
    });
    tab.view.setVisible(shouldShow);
  }
}

function sendLayout() {
  arrangeViews();
  safeSend('browser:layout-applied', { chromeHeight, sidePanelWidth });
}

function configureSession(browserSession, isPrivate) {
  const hooksFlag = isPrivate ? 'privateHooksInstalled' : 'regularHooksInstalled';
  if (isPrivate ? privateHooksInstalled : regularHooksInstalled) return;

  browserSession.webRequest.onBeforeRequest({ urls: ['<all_urls>'] }, (details, callback) => {
    if (!data.settings.shieldsEnabled || !details.url) return callback({ cancel: false });
    let hostname = '';
    try { hostname = new URL(details.url).hostname.toLowerCase(); } catch { return callback({ cancel: false }); }
    const blocked = TRACKER_HOSTS.some((host) => hostname === host || hostname.endsWith(`.${host}`) || details.url.toLowerCase().includes(host));
    callback({ cancel: blocked });
  });

  browserSession.setPermissionRequestHandler((webContents, permission, callback, details) => {
    const origin = details?.requestingUrl || webContents.getURL() || 'este site';
    const allowedPermissions = new Set(['media', 'geolocation', 'notifications', 'clipboard-read', 'fullscreen']);
    if (!allowedPermissions.has(permission) || !mainWindow || mainWindow.isDestroyed()) {
      callback(false);
      return;
    }
    dialog.showMessageBox(mainWindow, {
      type: 'question',
      buttons: ['Permitir uma vez', 'Bloquear'],
      defaultId: 1,
      cancelId: 1,
      title: 'Permissão do site',
      message: `${getHost(origin) || origin} quer acessar: ${permission}.`,
      detail: 'O Pexlora só libera esta permissão depois da sua confirmação.'
    }).then((result) => callback(result.response === 0)).catch(() => callback(false));
  });

  browserSession.on('will-download', (_event, item) => {
    const folder = path.join(app.getPath('downloads'), 'Pexlora');
    fs.mkdirSync(folder, { recursive: true });
    const requestedName = path.basename(item.getFilename() || `download-${Date.now()}`);
    const extension = path.extname(requestedName);
    const baseName = path.basename(requestedName, extension);
    let fileName = requestedName;
    let suffix = 1;
    while (fs.existsSync(path.join(folder, fileName))) {
      fileName = `${baseName} (${suffix++})${extension}`;
    }
    const savePath = path.join(folder, fileName);
    item.setSavePath(savePath);

    const entry = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      fileName,
      savePath,
      url: item.getURL(),
      state: 'Baixando',
      receivedBytes: 0,
      totalBytes: item.getTotalBytes() || 0,
      startedAt: Date.now()
    };
    data.downloads.unshift(entry);
    saveData();
    broadcastState();

    item.on('updated', (_event, state) => {
      entry.receivedBytes = item.getReceivedBytes();
      entry.totalBytes = item.getTotalBytes();
      entry.state = state === 'interrupted' ? 'Interrompido' : 'Baixando';
      saveData();
      safeSend('browser:download-updated', entry);
    });
    item.once('done', (_event, state) => {
      entry.state = state === 'completed' ? 'Concluído' : (state === 'cancelled' ? 'Cancelado' : 'Falhou');
      entry.receivedBytes = item.getReceivedBytes();
      entry.totalBytes = item.getTotalBytes();
      entry.finishedAt = Date.now();
      saveData();
      broadcastState();
    });
  });

  if (isPrivate) privateHooksInstalled = true;
  else regularHooksInstalled = true;
}

function getSession(isPrivate) {
  if (isPrivate) {
    if (!privateSession) privateSession = session.fromPartition('pexlora-private');
    configureSession(privateSession, true);
    return privateSession;
  }
  if (!regularSession) regularSession = session.fromPartition('persist:pexlora');
  configureSession(regularSession, false);
  return regularSession;
}

function createTab(url = '', isPrivate = false) {
  const id = nextTabId++;
  const browserSession = getSession(isPrivate);
  const view = new WebContentsView({
    webPreferences: {
      session: browserSession,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      spellcheck: true
    }
  });

  const tab = {
    id,
    view,
    url: '',
    title: isPrivate ? 'Pexlora Private' : 'Nova guia',
    home: true,
    isPrivate,
    loading: false
  };
  tabs.set(id, tab);
  mainWindow.contentView.addChildView(view);
  view.setVisible(false);

  const contents = view.webContents;
  contents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    const key = String(input.key || '').toLowerCase();
    const modifier = input.control || input.meta;
    if (modifier && key === 'l') {
      event.preventDefault();
      safeSend('browser:focus-address');
    } else if (modifier && key === 't') {
      event.preventDefault();
      createTab('', false);
    } else if (modifier && key === 'w') {
      event.preventDefault();
      closeTab(id);
    } else if (modifier && key === 'r') {
      event.preventDefault();
      contents.reload();
    } else if (modifier && key === 'h') {
      event.preventDefault();
      safeSend('browser:open-panel', 'history');
    } else if (modifier && key === 'j') {
      event.preventDefault();
      safeSend('browser:open-panel', 'downloads');
    } else if (modifier && input.shift && key === 'n') {
      event.preventDefault();
      createTab('', true);
    } else if (modifier && key === 'tab') {
      event.preventDefault();
      const ids = [...tabs.keys()];
      const index = ids.indexOf(activeTabId);
      const direction = input.shift ? -1 : 1;
      activeTabId = ids[(index + direction + ids.length) % ids.length];
      arrangeViews();
      broadcastState();
    } else if (input.alt && key === 'arrowleft') {
      if (contents.canGoBack()) {
        event.preventDefault();
        contents.goBack();
      }
    } else if (input.alt && key === 'arrowright') {
      if (contents.canGoForward()) {
        event.preventDefault();
        contents.goForward();
      }
    }
  });
  contents.setWindowOpenHandler(({ url: targetUrl }) => {
    if (isSafeWebUrl(targetUrl)) createTab(targetUrl, isPrivate);
    else if (/^(mailto|tel):/i.test(targetUrl)) shell.openExternal(targetUrl);
    return { action: 'deny' };
  });

  contents.on('will-navigate', (event, targetUrl) => {
    if (!isSafeWebUrl(targetUrl) && !targetUrl.startsWith('about:')) event.preventDefault();
  });

  contents.on('did-start-loading', () => {
    tab.loading = true;
    broadcastState();
  });
  contents.on('did-stop-loading', () => {
    tab.loading = false;
    try {
      const currentUrl = contents.getURL();
      if (isSafeWebUrl(currentUrl)) tab.url = currentUrl;
      const title = contents.getTitle();
      if (title) tab.title = title;
    } catch { /* the tab may be closing */ }
    broadcastState();
  });
  contents.on('page-title-updated', (event, title) => {
    tab.title = title || tab.title;
    broadcastState();
  });
  contents.on('did-navigate', (_event, url) => {
    tab.url = url;
    tab.home = false;
    tab.title = contents.getTitle() || getHost(url) || 'Página';
    addHistory(url, tab.title, tab.isPrivate);
    broadcastState();
  });
  contents.on('did-navigate-in-page', (_event, url, isMainFrame) => {
    if (!isMainFrame) return;
    tab.url = url;
    tab.title = contents.getTitle() || getHost(url) || 'Página';
    addHistory(url, tab.title, tab.isPrivate);
    broadcastState();
  });
  contents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    if (!isMainFrame || errorCode === -3) return;
    tab.loading = false;
    safeSend('browser:error', { message: `Não foi possível abrir ${getHost(validatedURL) || 'a página'}: ${errorDescription}.` });
    broadcastState();
  });
  contents.on('render-process-gone', (_event, details) => {
    safeSend('browser:error', { message: `Uma página parou de responder (${details.reason}).` });
  });

  activeTabId = id;
  if (url) navigateTab(id, url);
  else broadcastState();
  arrangeViews();
  return id;
}

async function navigateTab(id, input) {
  const tab = tabs.get(id);
  if (!tab) return;
  const url = getSearchUrl(input);
  if (!url || !isSafeWebUrl(url)) return;
  tab.url = url;
  tab.title = getHost(url) || 'Pesquisa';
  tab.home = false;
  tab.loading = true;
  if (id === activeTabId) arrangeViews();
  broadcastState();
  try {
    await tab.view.webContents.loadURL(url);
  } catch (error) {
    tab.loading = false;
    safeSend('browser:error', { message: `Falha ao abrir a página: ${error.message}` });
    broadcastState();
  }
}

function closeTab(id) {
  const tab = tabs.get(id);
  if (!tab) return;
  const wasPrivate = tab.isPrivate;
  mainWindow.contentView.removeChildView(tab.view);
  tabs.delete(id);
  if (tab.view.webContents && !tab.view.webContents.isDestroyed()) tab.view.webContents.close();

  if (tabs.size === 0) {
    createTab('', false);
  } else if (activeTabId === id) {
    activeTabId = [...tabs.keys()].at(-1);
  }

  if (wasPrivate && ![...tabs.values()].some((item) => item.isPrivate) && privateSession) {
    privateSession.clearStorageData().catch(() => {});
    privateSession.clearCache().catch(() => {});
  }
  arrangeViews();
  broadcastState();
}

function goHome(id) {
  const tab = tabs.get(id);
  if (!tab) return;
  tab.home = true;
  tab.url = '';
  tab.title = tab.isPrivate ? 'Pexlora Private' : 'Nova guia';
  tab.loading = false;
  arrangeViews();
  broadcastState();
}

function addCurrentBookmark() {
  const tab = currentTab();
  if (!tab || tab.home || !isSafeWebUrl(tab.url)) return { ok: false, message: 'Abra um site antes de salvar um favorito.' };
  const existing = data.bookmarks.find((item) => item.url === tab.url);
  if (existing) return { ok: false, message: 'Este site já está nos favoritos.' };
  data.bookmarks.unshift({ title: tab.title || getHost(tab.url), url: tab.url, addedAt: Date.now() });
  saveData();
  broadcastState();
  return { ok: true, message: 'Favorito salvo.' };
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 780,
    minHeight: 560,
    title: APP_NAME,
    backgroundColor: '#15151b',
    autoHideMenuBar: true,
    show: false,
    icon: path.join(__dirname, 'assets', 'pexlora-owl.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('resize', arrangeViews);
  mainWindow.on('closed', () => { mainWindow = null; });
  createTab('');
}

app.whenReady().then(() => {
  app.setName(APP_NAME);
  loadData();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  clearTimeout(saveTimer);
  try {
    if (privateSession) {
      privateSession.clearStorageData().catch(() => {});
      privateSession.clearCache().catch(() => {});
    }
  } catch { /* app is shutting down */ }
});

ipcMain.handle('browser:ready', () => getPublicState());
ipcMain.on('browser:set-layout', (_event, layout = {}) => {
  chromeHeight = Math.max(70, Math.min(220, Number(layout.chromeHeight) || 88));
  sidePanelWidth = Math.max(0, Math.min(460, Number(layout.sidePanelWidth) || 0));
  sendLayout();
});
ipcMain.handle('browser:create-tab', (_event, options = {}) => createTab(options.url || '', Boolean(options.private)));
ipcMain.on('browser:activate-tab', (_event, id) => {
  if (!tabs.has(Number(id))) return;
  activeTabId = Number(id);
  arrangeViews();
  broadcastState();
});
ipcMain.on('browser:close-tab', (_event, id) => closeTab(Number(id)));
ipcMain.on('browser:navigate', (_event, payload = {}) => {
  const id = Number(payload.id) || activeTabId;
  navigateTab(id, payload.value || '');
});
ipcMain.on('browser:back', () => {
  const tab = currentTab();
  if (tab && tab.view.webContents.canGoBack()) tab.view.webContents.goBack();
});
ipcMain.on('browser:forward', () => {
  const tab = currentTab();
  if (tab && tab.view.webContents.canGoForward()) tab.view.webContents.goForward();
});
ipcMain.on('browser:reload', () => {
  const tab = currentTab();
  if (tab && !tab.home) tab.view.webContents.reload();
});
ipcMain.on('browser:home', () => goHome(activeTabId));
ipcMain.handle('browser:add-bookmark', () => addCurrentBookmark());
ipcMain.on('browser:remove-bookmark', (_event, url) => {
  data.bookmarks = data.bookmarks.filter((item) => item.url !== url);
  saveData();
  broadcastState();
});
ipcMain.on('browser:remove-history', (_event, url) => {
  data.history = data.history.filter((item) => item.url !== url);
  saveData();
  broadcastState();
});
ipcMain.handle('browser:update-settings', (_event, updates = {}) => {
  if (['google', 'duckduckgo'].includes(updates.searchEngine)) data.settings.searchEngine = updates.searchEngine;
  if (typeof updates.shieldsEnabled === 'boolean') data.settings.shieldsEnabled = updates.shieldsEnabled;
  if (typeof updates.showHomeOnStartup === 'boolean') data.settings.showHomeOnStartup = updates.showHomeOnStartup;
  saveData();
  broadcastState();
  return data.settings;
});
ipcMain.handle('browser:clear-data', async () => {
  data.history = [];
  data.bookmarks = [];
  if (regularSession) {
    await regularSession.clearStorageData();
    await regularSession.clearCache();
  }
  saveData();
  broadcastState();
  return true;
});
ipcMain.on('browser:open-download', (_event, filePath) => {
  const item = data.downloads.find((download) => download.savePath === filePath);
  if (item && fs.existsSync(item.savePath)) shell.openPath(item.savePath);
});
ipcMain.on('browser:show-download', (_event, filePath) => {
  if (filePath && fs.existsSync(filePath)) shell.showItemInFolder(filePath);
});
ipcMain.on('browser:open-external', (_event, url) => {
  if (/^https?:\/\//i.test(String(url))) shell.openExternal(url);
});
ipcMain.on('browser:clear-downloads', () => {
  data.downloads = data.downloads.filter((item) => item.state === 'Baixando');
  saveData();
  broadcastState();
});
ipcMain.handle('browser:page-info', async () => {
  const tab = currentTab();
  if (!tab || tab.home) return { title: 'Nova guia', url: '', text: '' };
  try {
    const text = await tab.view.webContents.executeJavaScript('document.body ? document.body.innerText.slice(0, 8000) : ""', true);
    return { title: tab.view.webContents.getTitle(), url: tab.view.webContents.getURL(), text };
  } catch {
    return { title: tab.title, url: tab.url, text: '' };
  }
});
