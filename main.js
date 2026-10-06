const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');
require('dotenv').config({ path: path.join(__dirname, '.env'), quiet: true });

const { app, BrowserWindow, ipcMain, protocol, net, shell, dialog } = require('electron');
const api = require('./lib/server-api');
const machineServer = require('./lib/machineServer');

// JHARLAB_USER_DATA gives tests (and portable installs) an isolated profile + database.
if (process.env.JHARLAB_USER_DATA) app.setPath('userData', path.resolve(process.env.JHARLAB_USER_DATA));
const userData = app.getPath('userData');

// Serve the static export (out/) unless running against `next dev`. JHARLAB_STATIC=1 serves out/ unpackaged.
const serveStatic = app.isPackaged || process.env.JHARLAB_STATIC === '1';
const resourcesDir = app.isPackaged ? process.resourcesPath : __dirname;
const outDir = path.join(__dirname, 'out');
const APP_ORIGIN = 'app://-';

// GPU acceleration is on for smooth scrolling/animation. If the GPU process ever crashes we remember it
// and restart in software mode, so machines with broken drivers still get a working window.
const gpuFlag = path.join(userData, 'gpu-disabled');
if (fs.existsSync(gpuFlag) || process.argv.includes('--disable-gpu')) app.disableHardwareAcceleration();

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
]);

let mainWindow = null;
let prisma = null;
let dbError = null;
const ctx = { prisma: null, dataDir: userData };

async function initDatabase() {
  try {
    const clientDir = path.join(resourcesDir, 'prisma', 'client');
    const engine = fs.readdirSync(clientDir).find(f => f.startsWith('query_engine'));
    if (engine) process.env.PRISMA_QUERY_ENGINE_LIBRARY = path.join(clientDir, engine);
    const { PrismaClient } = require(clientDir);

    // Dev keeps using prisma/dev.db; installs and isolated profiles keep the database in userData.
    const useRepoDb = !app.isPackaged && !process.env.JHARLAB_USER_DATA;
    const dbFile = useRepoDb ? path.join(__dirname, 'prisma', 'dev.db') : path.join(userData, 'dev.db');
    fs.mkdirSync(path.dirname(dbFile), { recursive: true });
    prisma = new PrismaClient({ datasources: { db: { url: `file:${dbFile.replace(/\\/g, '/')}` } } });
    await api.ensureSchema(prisma, fs.readFileSync(path.join(resourcesDir, 'prisma', 'schema.sql'), 'utf8'));
    ctx.prisma = prisma;
    console.log('Database ready:', dbFile);
  } catch (err) {
    console.error('Database initialisation failed:', err);
    dbError = err.message || String(err);
    prisma = null;
  }
}

// app://-/... serves the static export, and app://-/api/... runs the same handlers `next dev` uses.
function registerAppProtocol() {
  protocol.handle('app', async request => {
    const { pathname } = new URL(request.url);
    if (pathname.startsWith('/api/')) {
      if (!ctx.prisma) return Response.json({ success: false, error: `Database unavailable: ${dbError}` }, { status: 503 });
      return api.handleRequest(ctx, request);
    }
    const rel = path.normalize(decodeURIComponent(pathname)).replace(/^([\\/]+|\.\.[\\/])+/, '');
    const candidates = [rel || 'index.html', `${rel}.html`, path.join(rel, 'index.html')];
    const file = candidates.map(c => path.join(outDir, c)).find(f => f.startsWith(outDir) && fs.statSync(f, { throwIfNoEntry: false })?.isFile());
    return net.fetch(pathToFileURL(file || path.join(outDir, '404.html')).toString());
  });
}

function openExternal(url) {
  if (/^(https?|mailto|tel):/i.test(url)) shell.openExternal(url);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 680,
    show: false,
    backgroundColor: '#f5f6fa',
    autoHideMenuBar: true,
    title: 'JharLab',
    icon: path.join(__dirname, serveStatic ? 'out' : 'public', 'logo.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      plugins: true, // built-in PDF viewer for report previews
      spellcheck: false,
    },
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.maximize();
    mainWindow.show();
  });

  // Report previews/print windows (blob:, about:blank) stay in-app; web links open in the real browser,
  // so remote pages never get a window with the database bridge preloaded.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url === 'about:blank' || url.startsWith('blob:') || url.startsWith(APP_ORIGIN)) {
      return { action: 'allow', overrideBrowserWindowOptions: { autoHideMenuBar: true } };
    }
    openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url.startsWith(APP_ORIGIN) || url.startsWith('http://localhost:3000')) return;
    event.preventDefault();
    openExternal(url);
  });
  // E2E tests set JHARLAB_DOWNLOAD_DIR so downloads skip the Save dialog.
  if (process.env.JHARLAB_DOWNLOAD_DIR) {
    mainWindow.webContents.session.on('will-download', (_e, item) => item.setSavePath(path.join(process.env.JHARLAB_DOWNLOAD_DIR, item.getFilename())));
  }
  mainWindow.webContents.on('did-fail-load', (_e, code, desc, url) => console.error('Page failed to load:', code, desc, url));
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  if (serveStatic) {
    mainWindow.loadURL(`${APP_ORIGIN}/`);
  } else {
    mainWindow.loadURL('http://localhost:3000');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  app.whenReady().then(async () => {
    await initDatabase();
    if (serveStatic) registerAppProtocol();
    createWindow();
    machineServer.initMachineServer(prisma, () => mainWindow, userData);
    if (dbError) dialog.showErrorBox('JharLab could not open its database', dbError);
  });
}

app.on('child-process-gone', (_e, details) => {
  if (details.type === 'GPU' && ['crashed', 'launch-failed', 'abnormal-exit'].includes(details.reason) && !fs.existsSync(gpuFlag)) {
    console.error('GPU process failed, restarting in software rendering mode:', details.reason);
    fs.writeFileSync(gpuFlag, details.reason);
    app.relaunch();
    app.exit(0);
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (!mainWindow && app.isReady()) createWindow();
});

app.on('before-quit', () => {
  machineServer.stopInterfacing();
  prisma?.$disconnect();
});

// ==================== IPC ====================
const route = async (method, name, body) => (await api.callRoute(ctx, method, name, body)).json;
const dbUnavailable = () => ({ success: false, error: `Database is not initialized. Error: ${dbError}` });

ipcMain.handle('ping', () => 'pong');
ipcMain.handle('generate-qrcode', (_e, data) => api.reportQrPng(data));

ipcMain.handle('db-query', async (_e, payload) => {
  if (!prisma) return dbUnavailable();
  try {
    return { success: true, data: await api.dbQuery(prisma, payload) };
  } catch (error) {
    console.error(`DB Error (${payload?.model}.${payload?.action}):`, error.message);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('license-check', async () => {
  if (!prisma) return { valid: false, machineId: api.getMachineId(), reason: `Database is not initialized. Error: ${dbError}` };
  return route('GET', 'license/check');
});
ipcMain.handle('license-activate', (_e, licenseKey) => (prisma ? route('POST', 'license/activate', { licenseKey }) : dbUnavailable()));
ipcMain.handle('license-request-trial', () => (prisma ? route('POST', 'license/trial') : dbUnavailable()));

ipcMain.handle('machine-get-config', () => machineServer.getConfig());
ipcMain.handle('machine-save-config', (_e, config) => machineServer.saveConfig(config));
ipcMain.handle('machine-get-status', () => machineServer.getStatus());
ipcMain.handle('machine-start', () => machineServer.startInterfacing());
ipcMain.handle('machine-stop', () => machineServer.stopInterfacing());
ipcMain.handle('machine-get-logs', () => machineServer.getLogs());
ipcMain.handle('machine-clear-logs', () => machineServer.clearLogs());
ipcMain.handle('machine-simulate', (_e, type) => machineServer.runSimulator(type));
ipcMain.handle('machine-list-ports', () => machineServer.listSerialPorts());
ipcMain.handle('machine-get-orphans', () => machineServer.getOrphans());
ipcMain.handle('machine-delete-orphan', (_e, id) => machineServer.deleteOrphan(id));
ipcMain.handle('machine-reconcile-orphan', (_e, { orphanId, orderBarcode }) => machineServer.reconcileOrphan(orphanId, orderBarcode));

// Downloads the installer published by the admin dashboard, verifies it when a sha256 is provided,
// then runs it (NSIS one-click upgrades in place) and quits.
ipcMain.handle('download-and-install-update', async (_e, { url, version, sha256 }) => {
  const send = (channel, data) => mainWindow?.webContents.send(channel, data);
  try {
    if (!/^https:\/\//i.test(url)) throw new Error('Updates must be downloaded over HTTPS.');
    const res = await net.fetch(url);
    if (!res.ok) throw new Error(`Download failed: server returned ${res.status}`);
    const total = Number(res.headers.get('content-length')) || 0;
    const chunks = [];
    let received = 0;
    for await (const chunk of res.body) {
      chunks.push(chunk);
      received += chunk.length;
      if (total) send('update-progress', { percent: Math.round((received / total) * 100), downloaded: received, total });
    }
    const file = Buffer.concat(chunks);
    if (sha256 && require('crypto').createHash('sha256').update(file).digest('hex') !== sha256.toLowerCase()) {
      throw new Error('Downloaded update failed its integrity check. Please try again.');
    }
    const dest = path.join(app.getPath('temp'), `jharlab-update-${String(version).replace(/[^\w.-]/g, '')}${path.extname(new URL(url).pathname) || '.exe'}`);
    fs.writeFileSync(dest, file);
    const err = await shell.openPath(dest);
    if (err) throw new Error(err);
    setTimeout(() => app.quit(), 500);
    return { success: true };
  } catch (error) {
    console.error('Update installation failed:', error);
    send('update-error', error.message);
    return { success: false, error: error.message };
  }
});
