const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');
require('dotenv').config({ path: path.join(__dirname, '.env'), quiet: true });

const { app, BrowserWindow, ipcMain, protocol, net, shell, dialog, Menu } = require('electron');
const api = require('./lib/server-api');
const { can } = require('./lib/roles');
const machineServer = require('./lib/machineServer');

// JHARLAB_USER_DATA gives tests (and portable installs) an isolated profile + database.
if (process.env.JHARLAB_USER_DATA) app.setPath('userData', path.resolve(process.env.JHARLAB_USER_DATA));
const userData = app.getPath('userData');
// Dev keeps using prisma/dev.db (and prisma/backups); installs and isolated profiles keep both in userData,
// so a developer's test data never lands among a real lab's backups.
const useRepoDb = !app.isPackaged && !process.env.JHARLAB_USER_DATA;
const dataDir = useRepoDb ? path.join(__dirname, 'prisma') : userData;

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
let PrismaClient = null;
let dbFile = null;
let recoveredFrom = null;
// Shared by IPC and the app:// API: who is signed in, and a hook that tells the screens data changed.
const ctx = {
  prisma: null,
  dataDir,
  session: null,
  notify: model => mainWindow?.webContents.send('db-changed', model),
};
const allowed = action => can(ctx.session?.user?.role, action);

async function initDatabase() {
  try {
    const clientDir = path.join(resourcesDir, 'prisma', 'client');
    const engine = fs.readdirSync(clientDir).find(f => f.startsWith('query_engine'));
    if (engine) process.env.PRISMA_QUERY_ENGINE_LIBRARY = path.join(clientDir, engine);
    ({ PrismaClient } = require(clientDir));

    dbFile = path.join(dataDir, 'dev.db');
    // A lost database is brought back from the newest backup / an older install, never replaced by an empty lab.
    if (!useRepoDb) recoveredFrom = api.recoverMissingDatabase(dbFile, dataDir);
    fs.mkdirSync(path.dirname(dbFile), { recursive: true });
    prisma = new PrismaClient({ datasources: { db: { url: `file:${dbFile.replace(/\\/g, '/')}` } } });
    const sql = fs.readFileSync(path.join(resourcesDir, 'prisma', 'schema.sql'), 'utf8');
    const upgraded = await api.upgradeDatabase(prisma, sql, { dataDir, version: app.getVersion() });
    if (upgraded.backup) console.log('Copy of the database saved before this update:', upgraded.backup);
    ctx.prisma = prisma;
    console.log('Database ready:', dbFile);
    // Daily automatic backup (kept 14 days), checked at start-up and every 6 hours.
    const backup = () => api.autoBackup(ctx).catch(err => console.error('Automatic backup failed:', err.message));
    backup();
    setInterval(backup, 6 * 3600e3).unref();
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

// `npm run electron:dev`: the window loads next dev, but /api/* is answered here too, so sign-in and the
// database share one backend session exactly like the installed app.
function routeDevApiToMain() {
  protocol.handle('http', request => {
    const url = new URL(request.url);
    if (url.host === 'localhost:3000' && url.pathname.startsWith('/api/') && ctx.prisma) return api.handleRequest(ctx, request);
    return net.fetch(request, { bypassCustomProtocolHandlers: true });
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
      devTools: !app.isPackaged, // installed app: no DevTools for staff to poke at
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
    if (app.isPackaged) Menu.setApplicationMenu(null); // also removes the reload / inspect shortcuts
    if (serveStatic) registerAppProtocol();
    else routeDevApiToMain();
    createWindow();
    machineServer.initMachineServer(prisma, () => mainWindow, userData);
    if (dbError) dialog.showErrorBox('JharLab could not open its database', dbError);
    if (recoveredFrom) {
      dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: 'Lab data restored',
        message: 'JharLab could not find its database, so it restored your most recent lab data. Please check today\'s entries.',
        detail: `Restored from: ${recoveredFrom}`,
      });
    }
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
  machineServer.stopInterfacing({ remember: false });
  prisma?.$disconnect();
});

// ==================== IPC ====================
const route = async (method, name, body) => (await api.callRoute(ctx, method, name, body)).json;
const dbUnavailable = () => ({ success: false, error: `Database is not initialized. Error: ${dbError}` });

ipcMain.handle('ping', () => 'pong');

ipcMain.handle('db-query', async (_e, payload) => {
  if (!prisma) return dbUnavailable();
  try {
    return { success: true, data: await api.dbQuery(prisma, payload, ctx) };
  } catch (error) {
    if (!(error instanceof api.AccessError)) console.error(`DB Error (${payload?.model}.${payload?.action}):`, error.message);
    return { success: false, error: error.message, code: error instanceof api.AccessError ? 'ACCESS' : undefined };
  }
});

ipcMain.handle('license-check', async () => {
  if (!prisma) return { valid: false, machineId: api.getMachineId(), reason: `Database is not initialized. Error: ${dbError}` };
  return route('GET', 'license/check');
});
ipcMain.handle('license-activate', (_e, licenseKey) => (prisma ? route('POST', 'license/activate', { licenseKey }) : dbUnavailable()));
ipcMain.handle('license-request-trial', () => (prisma ? route('POST', 'license/trial') : dbUnavailable()));

// Analyzer settings change only for roles allowed to change settings (owner, admin, technician).
const denied = { success: false, error: 'Your role cannot change analyzer settings.' };
ipcMain.handle('machine-get-config', () => machineServer.getConfig());
ipcMain.handle('machine-save-config', (_e, config) => (allowed('settings') ? machineServer.saveConfig(config) : false));
ipcMain.handle('machine-get-status', () => machineServer.getStatus());
ipcMain.handle('machine-start', () => (allowed('settings') ? machineServer.startInterfacing() : false));
ipcMain.handle('machine-stop', () => (allowed('settings') ? machineServer.stopInterfacing() : false));
ipcMain.handle('machine-get-logs', () => machineServer.getLogs());
ipcMain.handle('machine-clear-logs', () => (allowed('settings') ? machineServer.clearLogs() : false));
ipcMain.handle('machine-simulate', (_e, type) => (allowed('settings') ? machineServer.runSimulator(type) : false));
ipcMain.handle('machine-list-ports', () => machineServer.listSerialPorts());
ipcMain.handle('machine-get-orphans', () => machineServer.getOrphans());
ipcMain.handle('machine-delete-orphan', (_e, id) => (allowed('results') ? machineServer.deleteOrphan(id) : false));
ipcMain.handle('machine-reconcile-orphan', (_e, { orphanId, orderBarcode }) => (allowed('results') ? machineServer.reconcileOrphan(orphanId, orderBarcode) : denied));

// ==================== BACKUP FILES ====================
// Save a copy anywhere (pendrive, another disk). JHARLAB_DOWNLOAD_DIR skips the dialog for E2E tests.
ipcMain.handle('backup-export', async () => {
  if (!allowed('backup:create')) return { success: false, error: 'Your role cannot export backups.' };
  try {
    const d = new Date(); // local date in the name (UTC is still yesterday before 5:30 AM IST)
    const name = `JharLab-backup-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}.db`;
    let dest = process.env.JHARLAB_DOWNLOAD_DIR && path.join(process.env.JHARLAB_DOWNLOAD_DIR, name);
    if (!dest) {
      const r = await dialog.showSaveDialog(mainWindow, {
        title: 'Save a copy of the lab database',
        defaultPath: path.join(app.getPath('documents'), name),
        filters: [{ name: 'JharLab backup', extensions: ['db'] }],
      });
      if (r.canceled || !r.filePath) return { success: false, canceled: true };
      dest = r.filePath;
    }
    const made = await api.createBackup(ctx, 'EXPORT', dest);
    return { success: true, ...made };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('backup-open-folder', () => shell.openPath(path.join(dataDir, 'backups')));

// Owner/admin only. Checks the file really is a JharLab database, saves a safety copy of today's data,
// swaps the database file and restarts the app on it.
ipcMain.handle('backup-restore', async (_e, file) => {
  if (!allowed('backup:restore')) return { success: false, error: 'Only the lab owner or an admin can restore a backup.' };
  try {
    if (!file) {
      const r = await dialog.showOpenDialog(mainWindow, {
        title: 'Restore a JharLab backup',
        defaultPath: path.join(dataDir, 'backups'),
        filters: [{ name: 'JharLab backup', extensions: ['db'] }],
        properties: ['openFile'],
      });
      if (r.canceled || !r.filePaths[0]) return { success: false, canceled: true };
      file = r.filePaths[0];
    }
    await api.verifyBackupFile(file, PrismaClient);
    const safety = await api.createBackup(ctx, 'SAFETY');
    await api.dbQuery(prisma, { model: 'activityLog', action: 'create', args: { data: { userId: ctx.session.user.id, module: 'Backup', action: 'Restored backup', details: `${path.basename(file)} (safety copy ${path.basename(safety.file)})` } } }, ctx);
    machineServer.stopInterfacing({ remember: false });
    await prisma.$disconnect();
    for (const ext of ['', '-wal', '-shm', '-journal']) fs.rmSync(dbFile + ext, { force: true });
    fs.copyFileSync(file, dbFile);
    if (!process.env.JHARLAB_NO_RELAUNCH) app.relaunch();
    setTimeout(() => app.exit(0), 300);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

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
