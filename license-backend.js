const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const { execSync } = require('child_process');
const crypto = require('crypto');
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

module.exports = {
  getMachineId,
  validateLicenseKey
};
