// Load environment variables from .env BEFORE anything else
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const { execSync } = require('child_process');
const crypto = require('crypto');
const machineServer = require('./lib/machineServer');

// Fix GPU crash on systems without proper GPU support
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-software-rasterizer');

const isDev = !app.isPackaged;

// ==================== LICENSE BACKEND (inlined) ====================
const SECRET_SALT = process.env.LICENSE_SECRET_SALT || 'Musharraf_709121SaltKey';
const ALGORITHM = 'aes-256-cbc';

function getCryptoParams() {
  const hash = crypto.createHash('sha256').update(SECRET_SALT).digest();
  const iv = crypto.createHash('md5').update(SECRET_SALT).digest();
  return { key: hash, iv: iv };
}

let cachedMachineId = null;

function getMachineId() {
  if (cachedMachineId) return cachedMachineId;
  try {
    if (process.platform === 'win32') {
      const output = execSync('reg query HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Cryptography /v MachineGuid', { encoding: 'utf8' });
      const match = /MachineGuid\s+REG_SZ\s+(\S+)/.exec(output);
      if (match && match[1]) {
        cachedMachineId = match[1].trim();
        return cachedMachineId;
      }
    } else if (process.platform === 'darwin') {
      const output = execSync("ioreg -rd1 -c IOPlatformExpertDevice | grep IOPlatformUUID | awk '{print $4}' | sed 's/\"//g'", { encoding: 'utf8' });
      cachedMachineId = output.trim();
      return cachedMachineId;
    } else if (process.platform === 'linux') {
      const output = execSync('cat /var/lib/dbus/machine-id /etc/machine-id 2>/dev/null | head -n 1', { encoding: 'utf8' });
      cachedMachineId = output.trim();
      return cachedMachineId;
    }
  } catch (e) {
    console.error('Failed to get Machine ID:', e);
  }
  return 'UNKNOWN-MACHINE-ID';
}

function decryptLicenseKey(licenseKey) {
  try {
    const cleanKey = licenseKey.trim().toLowerCase();
    if (cleanKey.length <= 32) {
      return null;
    }
    const ivHex = cleanKey.substring(0, 32);
    const encryptedHex = cleanKey.substring(32);
    
    const iv = Buffer.from(ivHex, 'hex');
    const { key } = getCryptoParams();
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    const parts = decrypted.split('|');
    if (parts.length === 2) {
      return {
        machineId: parts[0],
        expiryDate: parts[1],
      };
    }
  } catch (e) {
    console.error('License key decryption failed:', e);
  }
  return null;
}

function encryptLicenseKey(machineId, expiryDate) {
  const { key } = getCryptoParams();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const text = `${machineId}|${expiryDate}`;
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const licenseKey = iv.toString('hex') + encrypted;
  return licenseKey.toUpperCase();
}

function validateLicenseKey(licenseKey) {
  if (!licenseKey) {
    return { valid: false, reason: 'License key is missing' };
  }

  const decrypted = decryptLicenseKey(licenseKey);
  if (!decrypted) {
    return { valid: false, reason: 'Invalid license key format or signature' };
  }

  const currentMachineId = getMachineId();
  if (decrypted.machineId !== currentMachineId) {
    return { 
      valid: false, 
      reason: 'License key does not match this computer\'s Machine ID',
      machineId: decrypted.machineId,
      expiryDate: decrypted.expiryDate
    };
  }

  const expiry = new Date(decrypted.expiryDate);
  if (isNaN(expiry.getTime())) {
    return { valid: false, reason: 'Invalid expiration date in license key' };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  expiry.setHours(0, 0, 0, 0);

  if (today > expiry) {
    return { 
      valid: false, 
      reason: `License expired on ${decrypted.expiryDate}`,
      machineId: decrypted.machineId,
      expiryDate: decrypted.expiryDate
    };
  }

  return { 
    valid: true, 
    machineId: decrypted.machineId, 
    expiryDate: decrypted.expiryDate 
  };
}
// ==================== END LICENSE BACKEND ====================

let loadURL;
if (!isDev) {
  const serve = require('electron-serve');
  loadURL = serve({ directory: 'out' });
}

let mainWindow;
let prisma;
let prismaInitError = null;

// Initialize Prisma with proper database path
function initPrisma() {
  try {
    const fs = require('fs');

    if (!isDev) {
      // In production, tell Prisma where to find the native query engine
      // The engine is in extraResources/prisma/client/ (outside the asar)
      const queryEnginePath = path.join(
        process.resourcesPath,
        'prisma',
        'client',
        'query_engine-windows.dll.node'
      );
      if (fs.existsSync(queryEnginePath)) {
        process.env.PRISMA_QUERY_ENGINE_LIBRARY = queryEnginePath;
        console.log('Prisma query engine found at:', queryEnginePath);
      } else {
        console.error('Prisma query engine NOT found at:', queryEnginePath);
        // Try to find it dynamically
        const clientDir = path.join(process.resourcesPath, 'prisma', 'client');
        if (fs.existsSync(clientDir)) {
          const files = fs.readdirSync(clientDir);
          const engineFile = files.find(f => f.includes('query_engine'));
          if (engineFile) {
            process.env.PRISMA_QUERY_ENGINE_LIBRARY = path.join(clientDir, engineFile);
            console.log('Prisma query engine found dynamically:', engineFile);
          }
        }
      }

      // Also set the schema path for Prisma
      const schemaPath = path.join(process.resourcesPath, 'prisma', 'schema.prisma');
      if (fs.existsSync(schemaPath)) {
        process.env.PRISMA_SCHEMA_PATH = schemaPath;
      }
    }

    let PrismaClient;
    if (isDev) {
      PrismaClient = require('./prisma/client').PrismaClient;
    } else {
      const clientPath = path.join(process.resourcesPath, 'prisma', 'client');
      PrismaClient = require(clientPath).PrismaClient;
    }
    
    // In production, the database will be in the app's userData directory
    // In dev, it uses the default prisma/dev.db
    if (isDev) {
      prisma = new PrismaClient();
    } else {
      const dbPath = path.join(app.getPath('userData'), 'dev.db');
      
      // Copy database from resources if it doesn't exist in userData
      if (!fs.existsSync(dbPath)) {
        const srcDbPath = path.join(process.resourcesPath, 'prisma', 'dev.db');
        try {
          if (fs.existsSync(srcDbPath)) {
            // Ensure directory exists
            fs.mkdirSync(path.dirname(dbPath), { recursive: true });
            fs.copyFileSync(srcDbPath, dbPath);
            console.log('Database successfully copied to userData directory');
          } else {
            console.error('Source database not found at:', srcDbPath);
          }
        } catch (copyError) {
          console.error('Failed to copy database to userData directory:', copyError);
        }
      }

      // Replace backslashes with forward slashes for Prisma SQLite connection on Windows
      const normalizedDbPath = dbPath.replace(/\\/g, '/');

      prisma = new PrismaClient({
        datasources: {
          db: {
            url: `file:${normalizedDbPath}`,
          },
        },
      });
    }
    console.log('Prisma Client initialized successfully');
  } catch (error) {
    console.error('Failed to initialize Prisma Client:', error);
    prismaInitError = error.message || String(error);
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:3000');
    mainWindow.webContents.openDevTools();
  } else {
    loadURL(mainWindow);
  }

  // Log any renderer errors to the console for debugging
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.error('Page failed to load:', errorCode, errorDescription);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.on('ready', () => {
  initPrisma();
  createWindow();
  machineServer.initMachineServer(prisma, mainWindow);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

// Cleanup Prisma and Machine Interfacing on app quit
app.on('before-quit', async () => {
  machineServer.stopInterfacing();
  if (prisma) {
    await prisma.$disconnect();
  }
});

// License IPC Handlers
ipcMain.handle('license-check', async () => {
  try {
    const machineId = getMachineId();
    if (!prisma) {
      return { valid: false, machineId, reason: `Database is not initialized. Error: ${prismaInitError || 'Unknown Error'}` };
    }
    
    let settings = await prisma.labSettings.findFirst({ where: { id: 1 } });
    if (!settings) {
      settings = await prisma.labSettings.create({
        data: {
          id: 1,
          labName: 'JharLab',
          address: '123 Street Name',
          mobile: '9876543210'
        }
      });
    }
    
    if (!settings.licenseKey) {
      return {
        valid: false,
        machineId,
        reason: 'Software has not been activated. Please enter a license key.'
      };
    }
    
    const validation = validateLicenseKey(settings.licenseKey);
    return {
      valid: validation.valid,
      machineId,
      expiryDate: validation.expiryDate,
      reason: validation.reason
    };
  } catch (error) {
    console.error('IPC license-check error:', error);
    return { valid: false, machineId: getMachineId(), reason: error.message };
  }
});

ipcMain.handle('license-activate', async (event, licenseKey) => {
  try {
    if (!licenseKey) {
      return { success: false, error: 'License key is required' };
    }
    
    const validation = validateLicenseKey(licenseKey);
    if (!validation.valid) {
      return { success: false, error: validation.reason || 'Invalid license key' };
    }
    
    if (!prisma) {
      return { success: false, error: `Database is not initialized. Error: ${prismaInitError || 'Unknown Error'}` };
    }
    
    await prisma.labSettings.upsert({
      where: { id: 1 },
      update: { licenseKey },
      create: {
        id: 1,
        labName: 'JharLab',
        address: '123 Street Name',
        mobile: '9876543210',
        licenseKey
      }
    });
    
    return {
      success: true,
      expiryDate: validation.expiryDate,
      message: 'License activated successfully!'
    };
  } catch (error) {
    console.error('IPC license-activate error:', error);
    return { success: false, error: error.message || 'Failed to activate license' };
  }
});

ipcMain.handle('license-request-trial', async () => {
  try {
    const fs = require('fs');
    const userDataPath = app.getPath('userData');
    const trialFilePath = path.join(userDataPath, 'trial.json');
    
    if (fs.existsSync(trialFilePath)) {
      return { success: false, error: 'Trial license has already been activated on this system.' };
    }
    
    const machineId = getMachineId();
    
    // Calculate expiry date: 7 days from now
    const expiry = new Date();
    expiry.setDate(expiry.getDate() + 7);
    const expiryStr = expiry.toISOString().slice(0, 10);
    
    // Generate license key
    const licenseKey = encryptLicenseKey(machineId, expiryStr);
    
    if (!prisma) {
      return { success: false, error: 'Database is not initialized. Cannot activate trial.' };
    }
    
    // Save to database
    await prisma.labSettings.upsert({
      where: { id: 1 },
      update: { licenseKey },
      create: {
        id: 1,
        labName: 'JharLab',
        address: '123 Street Name',
        mobile: '9876543210',
        licenseKey
      }
    });
    
    // Create the trial.json file to prevent future trial activations
    fs.writeFileSync(trialFilePath, JSON.stringify({ activated: true, date: Date.now(), expiry: expiryStr }, null, 2));
    
    return {
      success: true,
      expiryDate: expiryStr,
      message: '7-Day Free Trial activated successfully!'
    };
  } catch (error) {
    console.error('IPC license-request-trial error:', error);
    return { success: false, error: error.message || 'Failed to activate trial' };
  }
});

ipcMain.handle('ping', () => 'pong');

ipcMain.handle('print-pdf', async (event, pdfData) => {
  // Logic to print PDF invisibly or show dialog
  return true;
});

// Machine Interfacing IPC Handlers
ipcMain.handle('machine-get-config', () => machineServer.getConfig());
ipcMain.handle('machine-save-config', (event, newConfig) => machineServer.saveConfig(newConfig));
ipcMain.handle('machine-get-status', () => machineServer.getStatus());
ipcMain.handle('machine-start', () => machineServer.startInterfacing());
ipcMain.handle('machine-stop', () => machineServer.stopInterfacing());
ipcMain.handle('machine-get-logs', () => machineServer.getLogs());
ipcMain.handle('machine-clear-logs', () => machineServer.clearLogs());
ipcMain.handle('machine-simulate', (event, type) => machineServer.runSimulator(type));
ipcMain.handle('machine-get-orphans', () => machineServer.getOrphans());
ipcMain.handle('machine-delete-orphan', (event, id) => machineServer.deleteOrphan(id));
ipcMain.handle('machine-reconcile-orphan', (event, { orphanId, orderBarcode }) => machineServer.reconcileOrphan(orphanId, orderBarcode));

ipcMain.handle('generate-qrcode', async (event, data) => {
  try {
    const bwipjs = require('bwip-js');
    const zlib = require('zlib');
    const crypto = require('crypto');
    const SECRET_SALT = process.env.LICENSE_SECRET_SALT || 'Musharraf_709121SaltKey';

    const shortenMedicalName = (name) => {
      const map = {
        'Complete Blood Count (CBC)': 'CBC',
        'Complete Blood Count': 'CBC',
        'Liver Function Test (LFT)': 'LFT',
        'Liver Function Test': 'LFT',
        'Renal Function Test (RFT)': 'RFT',
        'Renal Function Test': 'RFT',
        'Thyroid Profile': 'Thyroid',
        'Lipid Profile': 'Lipid',
        'Hemoglobin (Hb)': 'Hb',
        'Erythrocyte (RBC) Count': 'RBC',
        'Packed Cell Volume (PCV)': 'PCV',
        'Total Leucocytes (WBC) Count': 'WBC',
        'Mean Cell Volume (MCV)': 'MCV',
        'Mean Cell Haemoglobin (MCH)': 'MCH',
        'Mean Corpuscular Hb Concn. (MCHC)': 'MCHC',
        'Red Cell Distribution Width (RDW)': 'RDW',
        'Differential Leucocyte Count (DLC)': 'DLC',
        'Platelet count': 'Platelets',
        'Platelet Count': 'Platelets',
        'Neutrophils': 'Neutro',
        'Lymphocytes': 'Lympho',
        'Monocytes': 'Mono',
        'Eosinophils': 'Eosino',
        'Basophils': 'Baso',
        'Blood Sugar (Fasting)': 'Sugar Fasting',
        'Blood Sugar (PP)': 'Sugar PP',
        'Blood Sugar': 'Sugar',
        'HbA1c (Glycated Hemoglobin)': 'HbA1c',
        'Estimated Avg Glucose': 'eAG',
        'Serum Creatinine': 'Creatinine',
        'Uric Acid': 'Uric Acid',
        'Blood Urea': 'Urea',
        'Sodium (Na+)': 'Sodium',
        'Potassium (K+)': 'Potassium',
        'Chloride (Cl-)': 'Chloride',
        'Total Cholesterol': 'Cholesterol',
        'Triglycerides': 'Triglycerides',
        'HDL Cholesterol': 'HDL',
        'LDL Cholesterol': 'LDL',
        'VLDL Cholesterol': 'VLDL',
        'Total/HDL Ratio': 'Chol/HDL',
        'SGOT (AST)': 'SGOT',
        'SGPT (ALT)': 'SGPT',
        'Alkaline Phosphatase': 'ALP',
        'Total Bilirubin': 'Bilirubin Total',
        'Direct Bilirubin': 'Bilirubin Direct',
        'Indirect Bilirubin': 'Bilirubin Indirect',
        'Total Protein': 'Protein Total',
        'Albumin': 'Albumin',
        'Globulin': 'Globulin',
        'A/G Ratio': 'A/G Ratio',
        'T3 (Triiodothyronine)': 'T3',
        'T4 (Thyroxine)': 'T4',
        'TSH': 'TSH'
      };
      return map[name] || name;
    };

    const compactData = {
      o: data.orderNo,
      n: data.patientName,
      a: data.age || '',
      g: data.gender || '',
      d: data.date || '',
      l: data.labName || 'Diagnostic Centre',
      r: data.approvedBy || '',
      t: (data.tests || []).map((t) => ({
        n: shortenMedicalName(t.testName),
        p: (t.parameters || []).map((p) => ({
          n: shortenMedicalName(p.name),
          v: p.value,
          f: p.flag
        }))
      }))
    };

    const jsonStr = JSON.stringify(compactData);
    const compressed = zlib.deflateSync(jsonStr);
    const base64Data = compressed.toString('base64');
    
    const fullSignature = crypto.createHmac('sha256', SECRET_SALT).update(base64Data).digest('hex');
    const signature = fullSignature.substring(0, 16);

    const ADMIN_DASHBOARD_URL = process.env.NEXT_PUBLIC_ADMIN_DASHBOARD_URL || 'https://adminlabmanagement.vercel.app';
    const verifyUrl = `${ADMIN_DASHBOARD_URL}/verify?p=${encodeURIComponent(base64Data)}&s=${signature}`;

    const qrPngBuffer = await bwipjs.toBuffer({
      bcid: 'qrcode',
      text: verifyUrl,
      scale: 2,
      eclevel: 'L',
    });

    return qrPngBuffer;
  } catch (err) {
    console.error('IPC QR code generation error:', err);
    throw err;
  }
});

async function resolveValidUserId(validIds, superAdminId, providedId) {
  if (providedId && validIds.includes(Number(providedId))) {
    return Number(providedId);
  }
  if (superAdminId) {
    return superAdminId;
  }
  if (validIds.length > 0) {
    return validIds[0];
  }
  return providedId;
}

async function sanitizeUserIds(validIds, superAdminId, obj) {
  if (!obj || typeof obj !== 'object') {
    return obj;
  }
  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      obj[i] = await sanitizeUserIds(validIds, superAdminId, obj[i]);
    }
    return obj;
  }
  const userFields = ['userId', 'createdBy', 'receivedBy', 'enteredBy', 'verifiedBy', 'approvedBy'];
  for (const key of Object.keys(obj)) {
    if (userFields.includes(key)) {
      const val = obj[key];
      if (val !== null && val !== undefined && (typeof val === 'number' || typeof val === 'string')) {
        const intVal = parseInt(val, 10);
        if (!isNaN(intVal)) {
          obj[key] = await resolveValidUserId(validIds, superAdminId, intVal);
        }
      }
    } else {
      obj[key] = await sanitizeUserIds(validIds, superAdminId, obj[key]);
    }
  }
  return obj;
}

// Database IPC Handlers
ipcMain.handle('db-query', async (event, { model, action, args }) => {
  try {
    if (!prisma) {
      throw new Error('Prisma Client is not initialized. Database is unavailable.');
    }

    // Fetch valid user IDs to map any invalid foreign key references
    let validIds = [];
    let superAdminId = null;
    try {
      const users = await prisma.user.findMany({ select: { id: true, role: true } });
      validIds = users.map(u => u.id);
      const admin = users.find(u => u.role === 'SUPER_ADMIN');
      if (admin) {
        superAdminId = admin.id;
      }
    } catch (err) {
      console.error('Error pre-fetching users for ID sanitization:', err);
    }

    if (args) {
      args = await sanitizeUserIds(validIds, superAdminId, args);
    }

    // Intercept labSettings model creates, updates, and upserts to convert base64 images to Buffer
    if (model === 'labSettings' && (action === 'create' || action === 'update' || action === 'upsert')) {
      const convertBase64ToBuffer = (val) => {
        if (!val) return null;
        if (typeof val === 'string') {
          if (val.startsWith('data:image')) {
            const base64Data = val.split(';base64,').pop();
            return Buffer.from(base64Data, 'base64');
          }
          return Buffer.from(val, 'base64');
        }
        return val;
      };

      const fieldsToConvert = ['logo', 'signature', 'technicianSignature', 'pathologyDoctorSignature'];

      if (args) {
        if (args.data) {
          fieldsToConvert.forEach(field => {
            if (args.data[field] !== undefined) {
              args.data[field] = convertBase64ToBuffer(args.data[field]);
            }
          });
        }
        if (args.create) {
          fieldsToConvert.forEach(field => {
            if (args.create[field] !== undefined) {
              args.create[field] = convertBase64ToBuffer(args.create[field]);
            }
          });
        }
        if (args.update) {
          fieldsToConvert.forEach(field => {
            if (args.update[field] !== undefined) {
              args.update[field] = convertBase64ToBuffer(args.update[field]);
            }
          });
        }
      }
    }

    // Intercept test model creates and updates to handle nested parameter objects in SQLite/Prisma
    if (model === 'test' && (action === 'create' || action === 'update')) {
      const { parameters, ...testData } = args.data || {};
      if (parameters) {
        if (action === 'create') {
          const result = await prisma.test.create({
            data: {
              ...testData,
              parameters: {
                create: parameters.map((p, pIdx) => ({
                  name: p.name,
                  unit: p.unit || null,
                  sortOrder: p.sortOrder || (pIdx + 1),
                  type: p.type || 'NUMERIC',
                  options: p.options || null,
                  isHeader: p.isHeader || false,
                  refRanges: {
                    create: (p.refRanges || []).map(r => ({
                      gender: r.gender || null,
                      normalMin: r.normalMin !== undefined && r.normalMin !== '' && r.normalMin !== null ? Number(r.normalMin) : null,
                      normalMax: r.normalMax !== undefined && r.normalMax !== '' && r.normalMax !== null ? Number(r.normalMax) : null,
                      criticalMin: r.criticalMin !== undefined && r.criticalMin !== '' && r.criticalMin !== null ? Number(r.criticalMin) : null,
                      criticalMax: r.criticalMax !== undefined && r.criticalMax !== '' && r.criticalMax !== null ? Number(r.criticalMax) : null,
                      textNormal: r.textNormal || null
                    }))
                  }
                }))
              }
            },
            include: { category: true, parameters: { include: { refRanges: true } } }
          });
          return { success: true, data: result };
        } else if (action === 'update') {
          const testId = args.where.id;
          
          // Clear existing parameters and reference ranges
          const existingParams = await prisma.testParameter.findMany({ where: { testId } });
          for (const p of existingParams) {
            await prisma.referenceRange.deleteMany({ where: { parameterId: p.id } });
          }
          await prisma.testParameter.deleteMany({ where: { testId } });

          // Update test record & recreate parameters
          const result = await prisma.test.update({
            where: { id: testId },
            data: {
              ...testData,
              parameters: {
                create: parameters.map((p, pIdx) => ({
                  name: p.name,
                  unit: p.unit || null,
                  sortOrder: p.sortOrder || (pIdx + 1),
                  type: p.type || 'NUMERIC',
                  options: p.options || null,
                  isHeader: p.isHeader || false,
                  refRanges: {
                    create: (p.refRanges || []).map(r => ({
                      gender: r.gender || null,
                      normalMin: r.normalMin !== undefined && r.normalMin !== '' && r.normalMin !== null ? Number(r.normalMin) : null,
                      normalMax: r.normalMax !== undefined && r.normalMax !== '' && r.normalMax !== null ? Number(r.normalMax) : null,
                      criticalMin: r.criticalMin !== undefined && r.criticalMin !== '' && r.criticalMin !== null ? Number(r.criticalMin) : null,
                      criticalMax: r.criticalMax !== undefined && r.criticalMax !== '' && r.criticalMax !== null ? Number(r.criticalMax) : null,
                      textNormal: r.textNormal || null
                    }))
                  }
                }))
              }
            },
            include: { category: true, parameters: { include: { refRanges: true } } }
          });
          return { success: true, data: result };
        }
      }
    }

    if (!prisma[model] || !prisma[model][action]) {
      throw new Error(`Invalid Prisma model or action: ${model}.${action}`);
    }
    const result = await prisma[model][action](args || {});
    return { success: true, data: result };
  } catch (error) {
    console.error(`DB Error (${model}.${action}):`, error);
    return { success: false, error: error.message };
  }
});

// Auto-Update Download and Install IPC Handler
ipcMain.handle('download-and-install-update', async (event, { url, version }) => {
  try {
    console.log(`Starting update download for version ${version} from ${url}`);
    const fs = require('fs');
    const path = require('path');
    const { spawn } = require('child_process');

    const tempDir = app.getPath('temp');
    
    // Parse URL to extract file extension, defaulting to '.exe' on Windows
    let ext = '.exe';
    try {
      const urlParsed = new URL(url);
      const pathname = urlParsed.pathname;
      const parsedExt = path.extname(pathname);
      if (parsedExt) {
        ext = parsedExt;
      }
    } catch (e) {
      console.warn('Failed to parse file extension from URL, using default .exe', e);
    }
    
    const destPath = path.join(tempDir, `offline-lab-lis-update-${version}${ext}`);
    console.log(`Target destination: ${destPath}`);

    // Helper to download with redirect follow and progress updates
    const downloadWithRedirect = (downloadUrl, targetPath) => {
      return new Promise((resolve, reject) => {
        const httpLib = downloadUrl.startsWith('https') ? require('https') : require('http');
        
        const request = httpLib.get(downloadUrl, (response) => {
          // Handle redirect status codes (301, 302, 307, 308)
          if ([301, 302, 307, 308].includes(response.statusCode)) {
            const redirectUrl = response.headers.location;
            if (!redirectUrl) {
              reject(new Error(`Redirect status ${response.statusCode} returned without Location header`));
              return;
            }
            console.log(`Following redirect to: ${redirectUrl}`);
            downloadWithRedirect(redirectUrl, targetPath).then(resolve).catch(reject);
            return;
          }

          if (response.statusCode !== 200) {
            reject(new Error(`Failed to download: Server returned status code ${response.statusCode}`));
            return;
          }

          const fileStream = fs.createWriteStream(targetPath);
          const totalBytes = parseInt(response.headers['content-length'] || '0', 10);
          let downloadedBytes = 0;

          response.pipe(fileStream);

          response.on('data', (chunk) => {
            downloadedBytes += chunk.length;
            if (totalBytes > 0) {
              const percent = Math.round((downloadedBytes / totalBytes) * 100);
              if (mainWindow) {
                mainWindow.webContents.send('update-progress', {
                  percent,
                  downloaded: downloadedBytes,
                  total: totalBytes
                });
              }
            }
          });

          fileStream.on('finish', () => {
            fileStream.close();
            resolve(targetPath);
          });

          fileStream.on('error', (err) => {
            fs.unlink(targetPath, () => {});
            reject(err);
          });

          response.on('error', (err) => {
            fs.unlink(targetPath, () => {});
            reject(err);
          });
        });

        request.on('error', (err) => {
          fs.unlink(targetPath, () => {});
          reject(err);
        });
      });
    };

    // Execute download
    await downloadWithRedirect(url, destPath);
    console.log(`Download complete: ${destPath}`);

    // Execute installer and quit app
    if (process.platform === 'win32') {
      console.log('Launching installer on Windows as detached process...');
      const child = spawn(destPath, [], {
        detached: true,
        stdio: 'ignore'
      });
      child.unref();
      
      // Delay slightly before quitting to make sure spawn succeeded
      setTimeout(() => {
        app.quit();
      }, 500);
    } else {
      console.log('Opening installer path for other OS...');
      const { shell } = require('electron');
      await shell.openPath(destPath);
      setTimeout(() => {
        app.quit();
      }, 500);
    }

    return { success: true };
  } catch (error) {
    console.error('Update installation failed:', error);
    if (mainWindow) {
      mainWindow.webContents.send('update-error', error.message || String(error));
    }
    return { success: false, error: error.message || String(error) };
  }
});

