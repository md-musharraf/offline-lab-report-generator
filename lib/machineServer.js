const fs = require('fs');
const path = require('path');
const net = require('net');
const { spawn } = require('child_process');

let prisma = null;
let mainWindow = null;

// File paths to store configuration and unmatched (orphan) scans
const CONFIG_FILE = path.join(
  process.env.APPDATA || (process.platform === 'darwin' ? process.env.HOME + '/Library/Application Support' : process.env.HOME),
  'offline-lab-lis-machine-config.json'
);

const ORPHAN_FILE = path.join(
  process.env.APPDATA || (process.platform === 'darwin' ? process.env.HOME + '/Library/Application Support' : process.env.HOME),
  'offline-lab-lis-orphan-results.json'
);

// In-memory logs cache (limited to 200 items)
let logs = [];
let status = 'Inactive'; // Inactive, Listening, Error
let tcpServer = null;
let serialProcess = null; // Reference to spawned PowerShell serial listener process
let orphans = []; // Unmatched scans list

// Default config
let config = {
  connectionType: 'LAN', // LAN or COM
  tcpPort: 5000,
  tcpMode: 'Server', // Server (Listen) or Client (Connect)
  tcpHost: '127.0.0.1', // if client
  comPort: 'COM1',
  baudRate: 9600,
  dataBits: 8,
  parity: 'none', // none, odd, even
  stopBits: 1,
  protocol: 'ASTM', // ASTM or HL7
  bidirectional: true,
  autoApproveNormal: false, // Auto-Validation Rule toggle
  parameterMapping: {}, // machineCode: parameterId (Int)
  testMapping: {} // lisTestId: machineTestCode (String)
};

// Log levels
const LOG_SYSTEM = 'SYSTEM';
const LOG_RAW = 'RAW';
const LOG_PARSED = 'PARSED';
const LOG_ERROR = 'ERROR';

// Log helper
function addLog(type, message) {
  const logEntry = {
    id: Date.now() + Math.random().toString(36).substr(2, 5),
    timestamp: new Date().toISOString(),
    type,
    message
  };
  logs.unshift(logEntry);
  if (logs.length > 200) {
    logs.pop();
  }
  // Send log to frontend window
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('machine-log', logEntry);
  }
  console.log(`[Machine ${type}] ${message}`);
}

function updateStatus(newStatus) {
  status = newStatus;
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('machine-status', status);
  }
}

// Load settings from file
function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const fileData = fs.readFileSync(CONFIG_FILE, 'utf8');
      const parsed = JSON.parse(fileData);
      config = { ...config, ...parsed };
      console.log('Machine interfacing configuration loaded from:', CONFIG_FILE);
    } else {
      saveConfig(config);
    }
  } catch (err) {
    console.error('Failed to load machine configuration:', err);
  }
}

// Save settings to file
function saveConfig(newConfig) {
  try {
    config = { ...config, ...newConfig };
    fs.mkdirSync(path.dirname(CONFIG_FILE), { recursive: true });
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8');
    addLog(LOG_SYSTEM, 'Interfacing settings saved successfully.');
    return true;
  } catch (err) {
    addLog(LOG_ERROR, `Failed to save settings: ${err.message}`);
    return false;
  }
}

// Load unmatched scans from file
function loadOrphans() {
  try {
    if (fs.existsSync(ORPHAN_FILE)) {
      orphans = JSON.parse(fs.readFileSync(ORPHAN_FILE, 'utf8'));
      console.log('Orphan unmatched scans loaded:', orphans.length);
    }
  } catch (err) {
    console.error('Failed to load unmatched scans cache:', err);
  }
}

// Save unmatched scans to file
function saveOrphans() {
  try {
    fs.mkdirSync(path.dirname(ORPHAN_FILE), { recursive: true });
    fs.writeFileSync(ORPHAN_FILE, JSON.stringify(orphans, null, 2), 'utf8');
    
    // Dispatch to client window
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('orphans-updated', orphans);
    }
  } catch (err) {
    console.error('Failed to save unmatched scans cache:', err);
  }
}

// Initialize module
function initMachineServer(prismaInstance, mainWindowInstance) {
  prisma = prismaInstance;
  mainWindow = mainWindowInstance;
  loadConfig();
  loadOrphans();
  addLog(LOG_SYSTEM, 'Machine Interfacing background service initialized.');
}

// Start listener
function startInterfacing() {
  if (status === 'Listening') {
    addLog(LOG_SYSTEM, 'Interfacing is already active.');
    return true;
  }

  updateStatus('Listening');
  addLog(LOG_SYSTEM, `Starting interfacing in ${config.connectionType} mode (${config.protocol} protocol)...`);

  if (config.connectionType === 'LAN') {
    return startTcpServer();
  } else {
    return startSerialListener();
  }
}

// Stop listener
function stopInterfacing() {
  let stopped = false;
  if (tcpServer) {
    tcpServer.close();
    tcpServer = null;
    addLog(LOG_SYSTEM, 'TCP Server stopped.');
    stopped = true;
  }
  if (serialProcess) {
    try {
      serialProcess.kill();
    } catch (e) {}
    serialProcess = null;
    addLog(LOG_SYSTEM, 'Serial port listener stopped.');
    stopped = true;
  }
  updateStatus('Inactive');
  if (stopped) {
    addLog(LOG_SYSTEM, 'Interfacing listener stopped.');
  }
  return true;
}

// ---------------- TCP SERVER ----------------
function startTcpServer() {
  try {
    tcpServer = net.createServer((socket) => {
      const remoteAddress = `${socket.remoteAddress}:${socket.remotePort}`;
      addLog(LOG_SYSTEM, `Analyzer connected from ${remoteAddress}`);

      let buffer = '';

      socket.on('data', async (data) => {
        const rawString = data.toString('binary');
        addLog(LOG_RAW, `Received: ${formatHexOrAscii(data)}`);

        // Check if LIS is currently transmitting a query response to this socket session
        if (socket.querySession) {
          if (data.includes(0x06)) { // ACK
            const session = socket.querySession;
            if (session.state === 'WAITING_ACK_FOR_ENQ') {
              session.currentIdx = 0;
              sendNextQueryFrame(socket);
            } else if (session.state === 'WAITING_ACK_FOR_FRAME') {
              session.currentIdx++;
              if (session.currentIdx < session.frames.length) {
                sendNextQueryFrame(socket);
              } else {
                // Done sending all frames, send EOT (0x04)
                addLog(LOG_RAW, 'Sending: <EOT> to terminate host query response.');
                socket.write(Buffer.from([0x04]));
                delete socket.querySession;
                addLog(LOG_SYSTEM, '[Host Query] Response transmission completed.');
              }
            }
          } else if (data.includes(0x15)) { // NAK
            addLog(LOG_ERROR, '[Host Query] Received NAK from analyzer. Resending last frame...');
            sendNextQueryFrame(socket);
          }
          return; // Skip normal incoming parsing while LIS is writing
        }

        if (config.protocol === 'HL7') {
          buffer += rawString;
          // HL7 MLLP Framing: VT (0x0B) ... FS CR (0x1C 0x0D)
          let startIdx = buffer.indexOf('\x0B');
          let endIdx = buffer.indexOf('\x1C\x0D');

          while (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
            const hl7Message = buffer.substring(startIdx + 1, endIdx);
            buffer = buffer.substring(endIdx + 2);

            addLog(LOG_SYSTEM, 'HL7 message frame extracted. Parsing...');
            const response = await handleHL7Message(hl7Message);

            if (config.bidirectional && response) {
              addLog(LOG_RAW, `Sending Response: ${formatHexOrAscii(Buffer.from(response, 'binary'))}`);
              socket.write(response, 'binary');
            }

            // Look for next message in buffer
            startIdx = buffer.indexOf('\x0B');
            endIdx = buffer.indexOf('\x1C\x0D');
          }
        } else {
          // ASTM E1394
          // Look for ENQ (0x05)
          if (data.includes(0x05)) {
            addLog(LOG_SYSTEM, 'Received ASTM ENQ handshake. Sending ACK...');
            socket.write(Buffer.from([0x06])); // ACK
            buffer = '';
          } 
          // Look for EOT (0x04)
          else if (data.includes(0x04)) {
            addLog(LOG_SYSTEM, 'Received ASTM EOT (End of Transmission). Processing buffer...');
            
            // Check if there was an ASTM Host Query in the transmission buffer
            const queryBarcode = parseQueryBarcodeFromASTMBuffer(buffer);
            if (queryBarcode) {
              addLog(LOG_SYSTEM, `[Host Query] Detected ASTM Host Query for barcode: ${queryBarcode}`);
              buffer = '';
              setTimeout(() => {
                sendASTMQueryResponse(socket, queryBarcode);
              }, 200);
            } else {
              await handleASTMBuffer(buffer);
              buffer = '';
            }
          } 
          // Look for STX (0x02)
          else {
            buffer += rawString;
            // Frame is STX ... ETX/ETB Checksum CR LF
            let stxIdx = buffer.indexOf('\x02');
            while (stxIdx !== -1) {
              let etxIdx = buffer.indexOf('\x03', stxIdx); // ETX
              if (etxIdx === -1) {
                etxIdx = buffer.indexOf('\x17', stxIdx); // ETB
              }

              if (etxIdx !== -1 && buffer.length >= etxIdx + 4) { // 1 char delimiter, 2 hex checksum, 1 CR, 1 LF (total etxIdx + 5)
                const frameContent = buffer.substring(stxIdx + 1, etxIdx + 3); // frame up to checksum
                // Verify checksum
                const dataToVerify = buffer.substring(stxIdx + 1, etxIdx + 1); // from frame number to ETX/ETB
                const receivedChecksum = buffer.substring(etxIdx + 1, etxIdx + 3);
                const computedChecksum = computeASTMChecksum(dataToVerify);

                if (receivedChecksum.toUpperCase() !== computedChecksum.toUpperCase()) {
                  addLog(LOG_ERROR, `ASTM Checksum Mismatch! Received: ${receivedChecksum}, Computed: ${computedChecksum}`);
                  if (config.bidirectional) {
                    socket.write(Buffer.from([0x15])); // NAK
                  }
                } else {
                  if (config.bidirectional) {
                    socket.write(Buffer.from([0x06])); // ACK
                  }
                }

                stxIdx = buffer.indexOf('\x02', etxIdx + 4);
              } else {
                break;
              }
            }
          }
        }
      });

      socket.on('close', () => {
        addLog(LOG_SYSTEM, `Analyzer connection closed: ${remoteAddress}`);
      });

      socket.on('error', (err) => {
        addLog(LOG_ERROR, `Socket error from ${remoteAddress}: ${err.message}`);
      });
    });

    tcpServer.listen(config.tcpPort, '0.0.0.0', () => {
      addLog(LOG_SYSTEM, `TCP Server listening on port ${config.tcpPort}`);
    });

    tcpServer.on('error', (err) => {
      addLog(LOG_ERROR, `TCP Server startup error: ${err.message}`);
      updateStatus('Error');
      stopInterfacing();
    });

    return true;
  } catch (err) {
    addLog(LOG_ERROR, `Failed to initialize TCP Server: ${err.message}`);
    updateStatus('Error');
    return false;
  }
}

// ---------------- SERIAL PORT LISTENER (POWERSHELL FALLBACK) ----------------
function startSerialListener() {
  try {
    let SerialPortLib = null;
    try {
      SerialPortLib = require('serialport').SerialPort;
      addLog(LOG_SYSTEM, 'Native serialport library found. Initializing...');
    } catch (e) {
      addLog(LOG_SYSTEM, 'Native serialport package not compiled or missing. Falling back to PowerShell serial engine...');
    }

    if (SerialPortLib) {
      const portInstance = new SerialPortLib({
        path: config.comPort,
        baudRate: Number(config.baudRate),
        dataBits: Number(config.dataBits),
        parity: config.parity,
        stopBits: Number(config.stopBits),
        autoOpen: false
      });

      portInstance.open((err) => {
        if (err) {
          addLog(LOG_ERROR, `Failed to open serial port ${config.comPort}: ${err.message}`);
          updateStatus('Error');
          return;
        }

        addLog(LOG_SYSTEM, `Serial Port ${config.comPort} opened at ${config.baudRate} baud.`);
        let buffer = '';

        portInstance.on('data', async (data) => {
          const rawString = data.toString('binary');
          addLog(LOG_RAW, `Received (Serial): ${formatHexOrAscii(data)}`);
          
          buffer += rawString;
          await processSerialStream(buffer, (ackResponse) => {
            if (config.bidirectional && ackResponse) {
              portInstance.write(Buffer.from(ackResponse, 'binary'));
            }
          });
        });

        portInstance.on('error', (err) => {
          addLog(LOG_ERROR, `Serial Port error: ${err.message}`);
          updateStatus('Error');
        });
      });

      serialProcess = {
        kill: () => {
          if (portInstance.isOpen) {
            portInstance.close();
          }
        }
      };
      return true;
    } else {
      if (process.platform !== 'win32') {
        addLog(LOG_ERROR, 'Serial port fallback is only supported on Windows.');
        updateStatus('Error');
        return false;
      }

      const psScript = `
$port = New-Object System.IO.Ports.SerialPort "${config.comPort}", ${config.baudRate}, ${config.parity}, ${config.dataBits}, ${config.stopBits}
$port.ReadTimeout = 500
$port.Open()
Write-Output "SERIAL_OPENED"

try {
  while ($port.IsOpen) {
    try {
      if ($port.BytesToRead -gt 0) {
        $bytes = New-Object byte[] $port.BytesToRead
        $read = $port.Read($bytes, 0, $bytes.Length)
        $hex = [System.BitConverter]::ToString($bytes, 0, $read) -replace "-"
        Write-Output "HEX:$hex"
      }
    } catch [TimeoutException] {
      # Ignore
    }
    Start-Sleep -Milliseconds 100
  }
} finally {
  $port.Close()
  Write-Output "SERIAL_CLOSED"
}
`;

      serialProcess = spawn('powershell.exe', ['-NoProfile', '-Command', psScript]);
      addLog(LOG_SYSTEM, `Spawned PowerShell serial client for ${config.comPort} (${config.baudRate} baud).`);

      let buffer = '';
      serialProcess.stdout.on('data', async (data) => {
        const lines = data.toString().split(/\r?\n/);
        for (const line of lines) {
          if (!line.trim()) continue;

          if (line.includes('SERIAL_OPENED')) {
            addLog(LOG_SYSTEM, `PowerShell Serial Port ${config.comPort} connected successfully.`);
          } else if (line.startsWith('HEX:')) {
            const hexData = line.substring(4);
            const rawBuffer = Buffer.from(hexData, 'hex');
            addLog(LOG_RAW, `Received (Serial HEX): ${formatHexOrAscii(rawBuffer)}`);

            const rawString = rawBuffer.toString('binary');
            buffer += rawString;

            await processSerialStream(buffer, (ackResponse) => {
              if (config.bidirectional && ackResponse) {
                addLog(LOG_SYSTEM, `Simulated serial handshake response sent: ${formatHexOrAscii(Buffer.from(ackResponse, 'binary'))}`);
              }
            });
          }
        }
      });

      serialProcess.stderr.on('data', (data) => {
        addLog(LOG_ERROR, `PowerShell Serial Error: ${data.toString()}`);
      });

      serialProcess.on('close', (code) => {
        addLog(LOG_SYSTEM, `PowerShell Serial process exited with code ${code}`);
        serialProcess = null;
        updateStatus('Inactive');
      });

      return true;
    }
  } catch (err) {
    addLog(LOG_ERROR, `Failed to initialize Serial Listener: ${err.message}`);
    updateStatus('Error');
    return false;
  }
}

async function processSerialStream(rawBuffer, writeCallback) {
  if (config.protocol === 'HL7') {
    let startIdx = rawBuffer.indexOf('\x0B');
    let endIdx = rawBuffer.indexOf('\x1C\x0D');

    while (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
      const hl7Message = rawBuffer.substring(startIdx + 1, endIdx);
      rawBuffer = rawBuffer.substring(endIdx + 2);

      addLog(LOG_SYSTEM, 'HL7 serial message frame extracted. Parsing...');
      const response = await handleHL7Message(hl7Message);

      if (response && writeCallback) {
        writeCallback(response);
      }

      startIdx = rawBuffer.indexOf('\x0B');
      endIdx = rawBuffer.indexOf('\x1C\x0D');
    }
  } else {
    let enqIdx = rawBuffer.indexOf('\x05');
    if (enqIdx !== -1) {
      addLog(LOG_SYSTEM, 'Received ASTM ENQ serial handshake. Replying ACK...');
      if (writeCallback) writeCallback('\x06');
      rawBuffer = rawBuffer.substring(enqIdx + 1);
    }

    let eotIdx = rawBuffer.indexOf('\x04');
    if (eotIdx !== -1) {
      addLog(LOG_SYSTEM, 'Received ASTM EOT serial frame. Processing accumulator...');
      const transmission = rawBuffer.substring(0, eotIdx);
      rawBuffer = rawBuffer.substring(eotIdx + 1);
      
      const queryBarcode = parseQueryBarcodeFromASTMBuffer(transmission);
      if (queryBarcode) {
        addLog(LOG_SYSTEM, `[Host Query] Serial query detected for barcode: ${queryBarcode}. (PowerShell mode does not support physical client replies).`);
      } else {
        await handleASTMBuffer(transmission);
      }
    }
  }
}

// ---------------- PARSERS ----------------

// 1. HL7 Parser (Result & Query)
async function handleHL7Message(hl7String) {
  try {
    const lines = hl7String.split(/\r|\n/).map(l => l.trim()).filter(l => l.length > 0);
    if (lines.length === 0) return '';

    const msh = lines[0].split('|');
    const msgType = msh[8]; // MSH-9

    // Intercept HL7 Host Query Message
    if (msgType && (msgType.includes('QBP') || msgType.includes('QRY'))) {
      addLog(LOG_SYSTEM, `[Host Query] Received HL7 Host Query type: ${msgType}`);
      return await handleHL7Query(hl7String);
    }

    let sampleId = null;
    const testResults = [];

    // Parse lines
    for (const line of lines) {
      const fields = line.split('|');
      const segmentType = fields[0];

      if (segmentType === 'OBR') {
        sampleId = fields[3] || fields[2];
        if (sampleId && sampleId.includes('^')) {
          sampleId = sampleId.split('^')[0];
        }
      } else if (segmentType === 'OBX') {
        let paramCode = fields[3];
        if (paramCode && paramCode.includes('^')) {
          paramCode = paramCode.split('^')[0];
        }
        const value = fields[5];
        const unit = fields[6];
        const refRange = fields[7];
        const flag = fields[8];

        if (paramCode && value !== undefined) {
          testResults.push({
            parameter: paramCode.trim(),
            value: value.trim(),
            unit: unit ? unit.trim() : null,
            refRange: refRange ? refRange.trim() : null,
            flag: flag ? flag.trim() : null
          });
        }
      }
    }

    if (!sampleId) {
      addLog(LOG_ERROR, 'HL7 Parsing Failed: Specimen ID (Barcode) not found in OBR segment.');
      return generateHL7Ack(hl7String, false, 'Specimen ID missing');
    }

    addLog(LOG_SYSTEM, `Parsed HL7 Message. Specimen ID: ${sampleId}, Results Count: ${testResults.length}`);
    await saveResultsToDatabase(sampleId, testResults);

    return generateHL7Ack(hl7String, true);
  } catch (err) {
    addLog(LOG_ERROR, `HL7 Parser Error: ${err.message}`);
    return generateHL7Ack(hl7String, false, err.message);
  }
}

function generateHL7Ack(originalMessage, success, errorMsg = '') {
  try {
    const lines = originalMessage.split(/\r|\n/);
    const msh = lines[0].split('|');
    const msgControlId = msh[9] || 'MSG_ID';
    const timestamp = new Date().toISOString().replace(/[-:T.Z]/g, '').substring(0, 14);

    const ack = [
      `MSH|^~\\&|LIS||ANALYZER||${timestamp}||ACK^R01|${msgControlId}|P|2.3`,
      `MSA|${success ? 'AA' : 'AE'}|${msgControlId}|${errorMsg}`
    ].join('\r');

    return `\x0B${ack}\x1C\x0D`;
  } catch (e) {
    return `\x0BMSH|^~\\&|LIS||ANALYZER||||ACK||P|2.3\rMSA|AE||Ack Generation Failed\x1C\x0D`;
  }
}

// HL7 Host Query Handler
async function handleHL7Query(hl7String) {
  try {
    const lines = hl7String.split(/\r|\n/).map(l => l.trim()).filter(l => l.length > 0);
    const msh = lines[0].split('|');
    const msgControlId = msh[9] || 'MSG_ID';

    let barcode = null;
    let querySegment = '';

    for (const line of lines) {
      const fields = line.split('|');
      if (fields[0] === 'QPD') {
        querySegment = line;
        barcode = fields[3]; // QPD-3
        if (barcode && barcode.includes('^')) {
          barcode = barcode.split('^').pop();
        }
      } else if (fields[0] === 'QRD') {
        querySegment = line;
        barcode = fields[9]; // QRD-9
        if (barcode && barcode.includes('^')) {
          barcode = barcode.split('^').pop();
        }
      }
    }

    if (!barcode) {
      addLog(LOG_ERROR, '[Host Query] Barcode parameter missing in HL7 query segments.');
      return generateHL7QueryResponse(msgControlId, querySegment, null, [], 'Barcode missing');
    }

    barcode = barcode.trim();
    addLog(LOG_SYSTEM, `[Host Query] Processing HL7 query for barcode: "${barcode}"`);

    // Fetch order in database
    let order = await prisma.testOrder.findFirst({
      where: {
        OR: [
          { barcodeData: barcode },
          { orderNo: barcode }
        ]
      },
      include: {
        patient: true,
        items: {
          include: {
            test: true
          }
        }
      }
    });

    if (!order && /^\d+$/.test(barcode)) {
      order = await prisma.testOrder.findFirst({
        where: { id: parseInt(barcode) },
        include: {
          patient: true,
          items: {
            include: {
              test: true
            }
          }
        }
      });
    }

    const testCodes = [];
    if (order) {
      order.items.forEach(item => {
        const mappedCode = config.testMapping && config.testMapping[item.test.id];
        const code = mappedCode || item.test.shortName || item.test.code;
        if (code && !testCodes.includes(code)) {
          testCodes.push(code.trim().toUpperCase());
        }
      });
    }

    if (testCodes.length === 0) {
      addLog(LOG_ERROR, `[Host Query] No pending test orders found for barcode: ${barcode}`);
      return generateHL7QueryResponse(msgControlId, querySegment, order ? order.patient : null, [], 'No tests ordered', barcode);
    }

    addLog(LOG_SYSTEM, `[Host Query] HL7 Match! Patient: "${order.patient.name}", Mapped Tests: [${testCodes.join(', ')}]`);
    return generateHL7QueryResponse(msgControlId, querySegment, order.patient, testCodes, '', barcode);

  } catch (err) {
    addLog(LOG_ERROR, `[Host Query] HL7 Query Handler Exception: ${err.message}`);
    return '';
  }
}

function generateHL7QueryResponse(msgControlId, querySegment, patient, testCodes, errorMsg = '', barcode = 'BARCODE') {
  const timestamp = new Date().toISOString().replace(/[-:T.Z]/g, '').substring(0, 14);
  const msh = `MSH|^~\\&|LIS||ANALYZER||${timestamp}||RSP^K11|${msgControlId}|P|2.3`;
  const msa = `MSA|AA|${msgControlId}|${errorMsg || 'Success'}`;
  
  let patientSegment = 'PID|1||||Unknown|||||||||||';
  if (patient) {
    const genderCode = patient.gender ? patient.gender.toUpperCase().substring(0, 1) : 'U';
    patientSegment = `PID|1||||${patient.name}|||${genderCode}|||||||||`;
  }

  let obrSegment = `OBR|1|${barcode}|${barcode}|^^^||||||||||||||||||||F`;
  if (testCodes.length > 0) {
    const testPayload = testCodes.map(c => `^^^${c}`).join('~');
    obrSegment = `OBR|1|${barcode}|${barcode}|${testPayload}||||||||||||||||||||F`;
  }

  const responseText = [
    msh,
    msa,
    querySegment,
    patientSegment,
    obrSegment
  ].filter(s => s.length > 0).join('\r');

  return `\x0B${responseText}\x1C\x0D`;
}

// 2. ASTM Parser (Results extraction)
async function handleASTMBuffer(astmString) {
  try {
    const records = astmString
      .split(/\r|\n/)
      .map(r => r.trim())
      .filter(r => r.length > 0)
      .map(r => {
        let clean = r;
        if (clean.charCodeAt(0) === 0x02) {
          clean = clean.substring(1); // remove STX
        }
        if (/^\d/.test(clean)) {
          clean = clean.replace(/^\d+/, '');
        }
        const etxIdx = clean.search(/[\x03\x17]/);
        if (etxIdx !== -1) {
          clean = clean.substring(0, etxIdx);
        }
        return clean;
      })
      .filter(r => r.length > 0);

    let sampleId = null;
    const testResults = [];

    for (const record of records) {
      const fields = record.split('|');
      const recordType = fields[0];

      if (recordType === 'O') {
        sampleId = fields[2];
        if (sampleId && sampleId.includes('^')) {
          sampleId = sampleId.split('^').pop();
        }
      } else if (recordType === 'R') {
        let paramCode = fields[2];
        if (paramCode) {
          paramCode = paramCode.replace(/^[\^]+/, '');
          if (paramCode.includes('^')) {
            paramCode = paramCode.split('^')[0];
          }
        }
        const value = fields[3];
        const unit = fields[4];
        const refRange = fields[5];
        const flag = fields[6];

        if (paramCode && value !== undefined) {
          testResults.push({
            parameter: paramCode.trim(),
            value: value.trim(),
            unit: unit ? unit.trim() : null,
            refRange: refRange ? refRange.trim() : null,
            flag: flag ? flag.trim() : null
          });
        }
      }
    }

    if (!sampleId) {
      addLog(LOG_ERROR, 'ASTM Parsing Failed: Specimen ID (Barcode) not found in O records.');
      return;
    }

    addLog(LOG_SYSTEM, `Parsed ASTM Transmission. Specimen ID: ${sampleId}, Results Count: ${testResults.length}`);
    await saveResultsToDatabase(sampleId, testResults);

  } catch (err) {
    addLog(LOG_ERROR, `ASTM Parser Error: ${err.message}`);
  }
}

// Parse ASTM Buffer specifically looking for Host Queries
function parseQueryBarcodeFromASTMBuffer(buffer) {
  const records = buffer.split(/\r|\n/).map(r => r.trim()).filter(r => r.length > 0);
  for (const r of records) {
    let clean = r;
    if (clean.charCodeAt(0) === 0x02) clean = clean.substring(1);
    if (/^\d/.test(clean)) clean = clean.replace(/^\d+/, '');
    const fields = clean.split('|');
    if (fields[0] === 'Q') {
      let barcode = fields[2];
      if (barcode) {
        barcode = barcode.replace(/^[\^]+/, '');
        if (barcode.includes('^')) {
          barcode = barcode.split('^').pop();
        }
        return barcode.trim();
      }
    }
  }
  return null;
}

// Send ASTM Host Query Response State Machine
async function sendASTMQueryResponse(socket, barcode) {
  addLog(LOG_SYSTEM, `[Host Query] ASTM Query received for barcode: "${barcode}". Searching LIS database...`);

  if (!prisma) {
    addLog(LOG_ERROR, '[Host Query] Database is not initialized. Cannot reply.');
    return;
  }

  try {
    let order = await prisma.testOrder.findFirst({
      where: {
        OR: [
          { barcodeData: barcode },
          { orderNo: barcode }
        ]
      },
      include: {
        patient: true,
        items: {
          include: {
            test: true
          }
        }
      }
    });

    if (!order && /^\d+$/.test(barcode)) {
      order = await prisma.testOrder.findFirst({
        where: { id: parseInt(barcode) },
        include: {
          patient: true,
          items: {
            include: {
              test: true
            }
          }
        }
      });
    }

    const testCodes = [];
    if (order) {
      order.items.forEach(item => {
        const mappedCode = config.testMapping && config.testMapping[item.test.id];
        const code = mappedCode || item.test.shortName || item.test.code;
        if (code && !testCodes.includes(code)) {
          testCodes.push(code.trim().toUpperCase());
        }
      });
    }

    const patientName = order ? order.patient.name : 'Unknown Patient';

    let responseFrames = [];
    if (testCodes.length === 0) {
      addLog(LOG_ERROR, `[Host Query] No pending tests found for barcode: ${barcode}. Sending ASTM Cancel Order frame.`);
      responseFrames = [
        `1H|\\^&|||LIS||||||||1394-97`,
        `2P|1|||${patientName}|||||||||||||||`,
        `3O|1|${barcode}||||||||||||||||||||X`,
        `4L|1|N`
      ];
    } else {
      addLog(LOG_SYSTEM, `[Host Query] ASTM Match! Programming tests [${testCodes.join(', ')}] for patient "${patientName}"`);
      const testCodesString = testCodes.map(c => `^^^${c}`).join('\\');
      responseFrames = [
        `1H|\\^&|||LIS||||||||1394-97`,
        `2P|1|||${patientName}|||||||||||||||`,
        `3O|1|${barcode}||${testCodesString}||||||||||||||||||||O`,
        `4L|1|N`
      ];
    }

    socket.querySession = {
      frames: responseFrames,
      currentIdx: -1,
      state: 'WAITING_ACK_FOR_ENQ'
    };

    addLog(LOG_RAW, 'Sending: <ENQ> to start host query response.');
    socket.write(Buffer.from([0x05]));

  } catch (err) {
    addLog(LOG_ERROR, `[Host Query] Database search exception: ${err.message}`);
  }
}

function sendNextQueryFrame(socket) {
  const session = socket.querySession;
  const frameText = session.frames[session.currentIdx];
  const check = computeASTMChecksum(frameText);
  const rawFrame = `\x02${frameText}\x0D\x03${check}\x0D\x0A`;
  addLog(LOG_RAW, `Sending Frame ${session.currentIdx + 1}/${session.frames.length}: ${formatHexOrAscii(Buffer.from(rawFrame, 'binary'))}`);
  session.state = 'WAITING_ACK_FOR_FRAME';
  socket.write(rawFrame, 'binary');
}

// ---------------- DATABASE INTEGRATION & AUTO-VALIDATION ----------------
async function saveQcResultsToDatabase(batchNumber, parsedResults) {
  if (!prisma) return;
  addLog(LOG_SYSTEM, `[QC Auto-Detect] Processing QC transmission for batch: "${batchNumber}"`);
  
  let level = "Level 1";
  const upperBatch = batchNumber.toUpperCase();
  if (upperBatch.includes('LEVEL3') || upperBatch.includes('L3') || upperBatch.includes('HIGH')) {
    level = "Level 3";
  } else if (upperBatch.includes('LEVEL2') || upperBatch.includes('L2') || upperBatch.includes('MID') || upperBatch.includes('NORMAL')) {
    level = "Level 2";
  } else if (upperBatch.includes('LEVEL1') || upperBatch.includes('L1') || upperBatch.includes('LOW')) {
    level = "Level 1";
  }

  let savedCount = 0;
  for (const r of parsedResults) {
    const valNum = parseFloat(r.value);
    if (isNaN(valNum)) continue;

    let parameterId = config.parameterMapping[r.parameter];
    let parameterName = r.parameter;
    let testName = "General";

    if (parameterId) {
      const parameterObj = await prisma.testParameter.findUnique({
        where: { id: Number(parameterId) },
        include: { test: true }
      });
      if (parameterObj) {
        parameterName = parameterObj.name;
        testName = parameterObj.test.name;
      }
    } else {
      const parameterObj = await prisma.testParameter.findFirst({
        where: {
          OR: [
            { shortName: r.parameter },
            { name: r.parameter }
          ]
        },
        include: { test: true }
      });
      if (parameterObj) {
        parameterName = parameterObj.name;
        testName = parameterObj.test.name;
      }
    }

    const lastQc = await prisma.qcResult.findFirst({
      where: { parameterName, level },
      orderBy: { date: 'desc' }
    });

    let expected = 10.0;
    if (lastQc) {
      expected = lastQc.expectedValue;
    } else {
      if (parameterId) {
        const refRange = await prisma.referenceRange.findFirst({
          where: { parameterId: Number(parameterId) }
        });
        if (refRange && refRange.normalMin !== null && refRange.normalMax !== null) {
          expected = (refRange.normalMin + refRange.normalMax) / 2;
        }
      }
    }

    const deviation = Number((valNum - expected).toFixed(4));
    const cv = expected !== 0 ? Number(((Math.abs(deviation) / expected) * 100).toFixed(2)) : 0;
    
    let status = 'PASS';
    if (cv > 15) status = 'FAIL';
    else if (cv >= 5) status = 'WARNING';

    await prisma.qcResult.create({
      data: {
        testName,
        parameterName,
        batchNumber,
        level,
        expectedValue: expected,
        measuredValue: valNum,
        deviation,
        cv,
        status,
        date: new Date()
      }
    });

    addLog(LOG_PARSED, `QC SUCCESS: Saved ${parameterName} (${level}) = ${valNum} (Target: ${expected}, CV: ${cv}%, Status: ${status})`);
    savedCount++;
  }

  addLog(LOG_SYSTEM, `[QC Auto-Detect] Saved ${savedCount} QC parameters to database.`);
  
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('qc-saved', {
      batch: batchNumber,
      count: savedCount
    });
  }
}

async function saveResultsToDatabase(sampleId, parsedResults) {
  if (!prisma) {
    addLog(LOG_ERROR, 'Database is not initialized. Cannot save results.');
    return;
  }

  // Get a valid user ID from DB to prevent foreign key constraint violations
  let systemUserId = 1;
  try {
    const defaultUser = await prisma.user.findFirst({
      where: { role: 'SUPER_ADMIN' },
      select: { id: true }
    }) || await prisma.user.findFirst({ select: { id: true } });
    if (defaultUser) {
      systemUserId = defaultUser.id;
    }
  } catch (err) {
    console.error('Failed to retrieve system user ID for machine server:', err);
  }

  const upperSampleId = sampleId.toUpperCase();
  if (upperSampleId.startsWith('QC-') || upperSampleId.startsWith('CONTROL-') || upperSampleId.startsWith('QC_')) {
    await saveQcResultsToDatabase(sampleId, parsedResults);
    return;
  }

  try {
    addLog(LOG_SYSTEM, `Searching database for order matching specimen ID "${sampleId}"...`);

    // Match order by barcodeData, orderNo or ID
    let order = await prisma.testOrder.findFirst({
      where: {
        OR: [
          { barcodeData: sampleId },
          { orderNo: sampleId }
        ]
      },
      include: {
        patient: true,
        items: {
          include: {
            test: {
              include: {
                parameters: {
                  include: {
                    refRanges: true
                  }
                }
              }
            },
            results: true
          }
        }
      }
    });

    if (!order && /^\d+$/.test(sampleId)) {
      order = await prisma.testOrder.findFirst({
        where: { id: parseInt(sampleId) },
        include: {
          patient: true,
          items: {
            include: {
              test: {
                include: {
                  parameters: {
                    include: {
                      refRanges: true
                    }
                  }
                }
              },
              results: true
            }
          }
        }
      });
    }

    // [Orphan Reconciliation Fallback]
    if (!order) {
      addLog(LOG_ERROR, `No matching order found for barcode: ${sampleId}. Caching in Unmatched Results.`);
      const orphanRecord = {
        id: 'orphan_' + Date.now() + Math.random().toString(36).substr(2, 5),
        barcode: sampleId,
        timestamp: new Date().toISOString(),
        results: parsedResults
      };
      orphans.unshift(orphanRecord);
      if (orphans.length > 100) orphans.pop();
      saveOrphans();
      return;
    }

    addLog(LOG_SYSTEM, `Order matched! Order No: ${order.orderNo}, Patient: ${order.patient.name}`);

    // Gather all parameters in ordered tests
    const allOrderedParameters = [];
    order.items.forEach(item => {
      item.test.parameters.forEach(param => {
        allOrderedParameters.push({
          parameter: param,
          orderItem: item
        });
      });
    });

    let savedCount = 0;

    // Loop results and match parameters
    for (const result of parsedResults) {
      let targetParameterId = config.parameterMapping[result.parameter];
      let matchedParamNode = null;

      if (targetParameterId) {
        matchedParamNode = allOrderedParameters.find(p => p.parameter.id === Number(targetParameterId));
      }

      if (!matchedParamNode) {
        matchedParamNode = allOrderedParameters.find(p => 
          (p.parameter.shortName && p.parameter.shortName.trim().toLowerCase() === result.parameter.toLowerCase()) ||
          p.parameter.name.trim().toLowerCase() === result.parameter.toLowerCase()
        );
      }

      if (!matchedParamNode) {
        addLog(LOG_SYSTEM, `Parameter "${result.parameter}" is not ordered or not mapped for this patient. Skipping.`);
        continue;
      }

      const parameter = matchedParamNode.parameter;
      const orderItem = matchedParamNode.orderItem;

      // Parse Value & Compute Reference Range Flags
      const valStr = result.value;
      const valNum = parseFloat(valStr);
      let isAbnormal = false;
      let isCritical = false;
      let flag = null;

      if (!isNaN(valNum)) {
        let patientAgeDays = order.patient.age * 365;
        if (order.patient.ageUnit === 'MONTHS') {
          patientAgeDays = order.patient.age * 30;
        } else if (order.patient.ageUnit === 'DAYS') {
          patientAgeDays = order.patient.age;
        }

        const gender = order.patient.gender ? order.patient.gender.toUpperCase() : null;

        const applicableRange = parameter.refRanges.find(range => {
          if (range.gender && range.gender.toUpperCase() !== 'BOTH' && range.gender.toUpperCase() !== gender) {
            return false;
          }
          if (range.ageMin !== null && patientAgeDays < range.ageMin) return false;
          if (range.ageMax !== null && patientAgeDays > range.ageMax) return false;
          return true;
        });

        if (applicableRange) {
          if (applicableRange.normalMin !== null && valNum < applicableRange.normalMin) {
            isAbnormal = true;
            flag = '↓';
          } else if (applicableRange.normalMax !== null && valNum > applicableRange.normalMax) {
            isAbnormal = true;
            flag = '↑';
          }

          if (applicableRange.criticalMin !== null && valNum < applicableRange.criticalMin) {
            isCritical = true;
            flag = '!!';
          } else if (applicableRange.criticalMax !== null && valNum > applicableRange.criticalMax) {
            isCritical = true;
            flag = '!!';
          }
        }
      }

      const existingResult = orderItem.results.find(r => r.parameterId === parameter.id);

      // Perform Delta Check
      let deltaCheckNote = "";
      let deltaFlag = flag;
      let deltaAbnormal = isAbnormal;

      if (!isNaN(valNum)) {
        const prevResult = await prisma.testResult.findFirst({
          where: {
            parameterId: parameter.id,
            orderItem: {
              order: {
                patientId: order.patient.id,
                id: { not: order.id },
                status: { in: ['ENTERED', 'VERIFIED', 'RESULT_ENTERED', 'COMPLETED'] }
              }
            }
          },
          orderBy: {
            enteredAt: 'desc'
          },
          include: {
            orderItem: {
              include: {
                order: true
              }
            }
          }
        });

        if (prevResult) {
          const prevVal = prevResult.numericValue !== null ? prevResult.numericValue : parseFloat(prevResult.textValue || '');
          if (!isNaN(prevVal) && prevVal !== 0) {
            const shift = ((valNum - prevVal) / prevVal) * 100;
            if (Math.abs(shift) >= 20) {
              deltaCheckNote = `[Delta Alert] Prev: ${prevVal} on ${new Date(prevResult.enteredAt).toLocaleDateString()} (Shift: ${shift > 0 ? '+' : ''}${shift.toFixed(1)}%)`;
              addLog(LOG_SYSTEM, `[Delta Check Alert] Parameter ${parameter.name} for ${order.patient.name} shifted by ${shift.toFixed(1)}% (Prev: ${prevVal}, New: ${valNum})`);
              if (!deltaFlag) {
                deltaFlag = 'Δ';
              }
              deltaAbnormal = true;
            }
          }
        }
      }

      const resultPayload = {
        numericValue: isNaN(valNum) ? null : valNum,
        textValue: valStr,
        status: 'ENTERED',
        flag: deltaFlag,
        isCritical,
        isAbnormal: deltaAbnormal,
        note: deltaCheckNote || null,
        enteredBy: systemUserId, // Default Admin/System
        enteredAt: new Date()
      };

      if (existingResult) {
        await prisma.testResult.update({
          where: { id: existingResult.id },
          data: resultPayload
        });
      } else {
        await prisma.testResult.create({
          data: {
            orderItemId: orderItem.id,
            parameterId: parameter.id,
            ...resultPayload
          }
        });
      }

      await prisma.testOrderItem.update({
        where: { id: orderItem.id },
        data: { status: 'ENTERED' }
      });

      addLog(LOG_PARSED, `SUCCESS: Saved parameter ${parameter.name} = ${valStr} ${flag ? `[Flag: ${flag}]` : ''}`);
      savedCount++;
    }

    if (savedCount > 0) {
      // Re-fetch the order to see the updated items and results
      const updatedOrder = await prisma.testOrder.findUnique({
        where: { id: order.id },
        include: { items: { include: { results: true } } }
      });

      const allDone = updatedOrder.items.every(item => item.status === 'ENTERED' || item.status === 'VERIFIED');
      
      if (allDone) {
        // [Auto-Validation / Approval Check]
        if (config.autoApproveNormal) {
          let hasAbnormal = false;
          
          // Flatten all results
          const allResults = [];
          updatedOrder.items.forEach(item => {
            allResults.push(...item.results);
          });

          for (const r of allResults) {
            if (r.isAbnormal || r.isCritical || r.flag) {
              hasAbnormal = true;
              break;
            }
          }

          if (!hasAbnormal) {
            addLog(LOG_SYSTEM, `[Auto-Validation] Normal ranges confirmed. Auto-approving report for ${order.patient.name}.`);
            
            // Mark all items as VERIFIED
            for (const item of updatedOrder.items) {
              await prisma.testOrderItem.update({
                where: { id: item.id },
                data: { status: 'VERIFIED' }
              });
            }

            // Mark order as VERIFIED
            await prisma.testOrder.update({
              where: { id: order.id },
              data: { status: 'VERIFIED' }
            });

            // Upsert report cache with approval
            await prisma.report.upsert({
              where: { orderId: order.id },
              update: {
                approvedBy: systemUserId,
                approvedAt: new Date()
              },
              create: {
                orderId: order.id,
                approvedBy: systemUserId,
                approvedAt: new Date()
              }
            });

            addLog(LOG_SYSTEM, `[Auto-Validation] SUCCESS: Report auto-approved for patient ${order.patient.name}.`);
          } else {
            addLog(LOG_SYSTEM, `[Auto-Validation] Abnormal parameters flagged. Holding report for manual Pathologist review.`);
            await prisma.testOrder.update({
              where: { id: order.id },
              data: { status: 'ENTERED' }
            });
          }
        } else {
          // Standard update (without auto-approve)
          await prisma.testOrder.update({
            where: { id: order.id },
            data: { status: 'ENTERED' }
          });
        }
      }

      addLog(LOG_SYSTEM, `Completed results injection. Matched & saved ${savedCount} parameters for ${order.patient.name}.`);
      
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('result-parsed', {
          patientName: order.patient.name,
          orderNo: order.orderNo,
          count: savedCount
        });
      }
    } else {
      addLog(LOG_ERROR, 'Failed to map any parsed parameter codes to LIS test parameters ordered.');
    }

  } catch (err) {
    addLog(LOG_ERROR, `Failed to save parsed results: ${err.message}`);
  }
}

// ---------------- UNMATCHED (ORPHAN) RECONCILIATION API ----------------
function getOrphans() {
  return orphans;
}

function deleteOrphan(id) {
  orphans = orphans.filter(o => o.id !== id);
  saveOrphans();
  return true;
}

async function reconcileOrphan(orphanId, orderBarcode) {
  const orphan = orphans.find(o => o.id === orphanId);
  if (!orphan) {
    addLog(LOG_ERROR, `[Reconciliation] Orphan scan ID ${orphanId} not found.`);
    return false;
  }

  addLog(LOG_SYSTEM, `[Reconciliation] Linking scan "${orphan.barcode}" to order barcode "${orderBarcode}"`);
  
  // Save results targeting this order barcode
  await saveResultsToDatabase(orderBarcode, orphan.results);
  
  // Delete scan from orphans list
  orphans = orphans.filter(o => o.id !== orphanId);
  saveOrphans();
  return true;
}

// ---------------- SIMULATOR SUITE ----------------
async function runSimulator(type) {
  addLog(LOG_SYSTEM, `[Simulator] Triggering mock ${type} transmission...`);
  
  if (!prisma) {
    addLog(LOG_ERROR, '[Simulator] Prisma not ready.');
    return false;
  }

  try {
    const targetOrder = await prisma.testOrder.findFirst({
      orderBy: { createdAt: 'desc' },
      include: { patient: true }
    });

    if (!targetOrder) {
      addLog(LOG_ERROR, '[Simulator] Create a patient order in the LIS first to run the simulator.');
      return false;
    }

    const testBarcode = targetOrder.barcodeData || targetOrder.orderNo;
    addLog(LOG_SYSTEM, `[Simulator] Selected Target Order: ${targetOrder.orderNo} (Barcode: ${testBarcode}) for patient: ${targetOrder.patient.name}`);

    if (type === 'Mindray ASTM') {
      addLog(LOG_RAW, 'Received: <ENQ>');
      addLog(LOG_SYSTEM, '[Simulator] Mock handshake active. Sending ACK...');
      
      const timestamp = new Date().toISOString().replace(/[-:T.Z]/g, '').substring(0, 14);
      const frames = [
        `1H|\\^&|||LIS||||||||1394-97`,
        `2P|1|||${targetOrder.patient.name}|||||||||||||||`,
        `3O|1|${testBarcode}||^^^CBC||||||||||||||||||||F`,
        `4R|1|^^^WBC|7.5|10*9/L|4.0-10.0|N||F||||${timestamp}`,
        `5R|2|^^^RBC|4.85|10*12/L|3.8-5.8|N||F||||${timestamp}`,
        `6R|3|^^^HGB|10.2|g/dL|11.5-16.5|L||F||||${timestamp}`,
        `7R|4|^^^PLT|135|10*9/L|150-400|L||F||||${timestamp}`,
        `8L|1|N`
      ];

      let accumulated = '';
      for (const frame of frames) {
        const check = computeASTMChecksum(frame);
        const rawFrame = `\x02${frame}\x0D\x03${check}\x0D\x0A`;
        addLog(LOG_RAW, `Received: ${formatHexOrAscii(Buffer.from(rawFrame, 'binary'))}`);
        accumulated += rawFrame;
      }

      addLog(LOG_RAW, 'Received: <EOT>');
      await handleASTMBuffer(accumulated);
      
    } else if (type === 'BioChem HL7') {
      const timestamp = new Date().toISOString().replace(/[-:T.Z]/g, '').substring(0, 14);
      const hl7String = [
        `MSH|^~\\&|ANALYZER||LIS||${timestamp}||ORU^R01|MSG00091|P|2.3`,
        `PID|1||PID123||${targetOrder.patient.name}|||||||||||||`,
        `OBR|1|${testBarcode}|${testBarcode}|^^^BIO||||||||||||||||||||F`,
        `OBX|1|NM|GLU^Glucose|1|142.5|mg/dL|70-110|H|||F`,
        `OBX|2|NM|CREA^Creatinine|1|1.85|mg/dL|0.6-1.2|H|||F`,
        `OBX|3|NM|CHOL^Cholesterol|1|195|mg/dL|100-200|N|||F`
      ].join('\r');

      const fullMllp = `\x0B${hl7String}\x1C\x0D`;
      addLog(LOG_RAW, `Received: ${formatHexOrAscii(Buffer.from(fullMllp, 'binary'))}`);
      
      await handleHL7Message(hl7String);
      
    } else if (type === 'Mindray ASTM Host Query') {
      addLog(LOG_SYSTEM, '[Simulator] Simulating Mindray Host Query frame transmission...');
      addLog(LOG_RAW, 'Received: <ENQ>');
      addLog(LOG_SYSTEM, '[Simulator] Mock handshake active. Sending ACK...');
      
      const queryFrame = `1Q|1|^${testBarcode}||||||||||Q`;
      const check = computeASTMChecksum(queryFrame);
      const rawQuery = `\x02${queryFrame}\x0D\x03${check}\x0D\x0A`;
      addLog(LOG_RAW, `Received: ${formatHexOrAscii(Buffer.from(rawQuery, 'binary'))}`);
      addLog(LOG_RAW, 'Received: <EOT>');

      setTimeout(() => {
        sendASTMQueryResponse(socketMock(), testBarcode);
      }, 300);

    } else if (type === 'BioChem HL7 Host Query') {
      addLog(LOG_SYSTEM, '[Simulator] Simulating BioChem HL7 Host Query message...');
      const timestamp = new Date().toISOString().replace(/[-:T.Z]/g, '').substring(0, 14);
      const qbpMessage = [
        `MSH|^~\\&|ANALYZER||LIS||${timestamp}||QBP^Q11|MSG_QUERY|P|2.3`,
        `QPD|QRY_CBC_GLU|QRY_01|^${testBarcode}||||`
      ].join('\r');

      const fullMllp = `\x0B${qbpMessage}\x1C\x0D`;
      addLog(LOG_RAW, `Received: ${formatHexOrAscii(Buffer.from(fullMllp, 'binary'))}`);

      const response = await handleHL7Message(qbpMessage);
      if (response) {
        addLog(LOG_RAW, `Sending RSP: ${formatHexOrAscii(Buffer.from(response, 'binary'))}`);
      }
    } else if (type === 'QC Simulator') {
      addLog(LOG_RAW, 'Received: <ENQ>');
      addLog(LOG_SYSTEM, '[Simulator] QC Simulator handshake active. Sending ACK...');
      
      const timestamp = new Date().toISOString().replace(/[-:T.Z]/g, '').substring(0, 14);
      const frames = [
        `1H|\\^&|||LIS||||||||1394-97`,
        `2P|1|||QC Control Level 1|||||||||||||||`,
        `3O|1|QC-CONTROL-L1||^^^CBC||||||||||||||||||||F`,
        `4R|1|^^^WBC|7.9|10*9/L|4.0-10.0|N||F||||${timestamp}`,
        `5R|2|^^^RBC|4.62|10*12/L|3.8-5.8|N||F||||${timestamp}`,
        `6R|3|^^^HGB|13.8|g/dL|11.5-16.5|N||F||||${timestamp}`,
        `7R|4|^^^PLT|220|10*9/L|150-400|N||F||||${timestamp}`,
        `8L|1|N`
      ];

      let accumulated = '';
      for (const frame of frames) {
        const check = computeASTMChecksum(frame);
        const rawFrame = `\x02${frame}\x0D\x03${check}\x0D\x0A`;
        addLog(LOG_RAW, `Received: ${formatHexOrAscii(Buffer.from(rawFrame, 'binary'))}`);
        accumulated += rawFrame;
      }

      addLog(LOG_RAW, 'Received: <EOT>');
      await handleASTMBuffer(accumulated);
    }

    return true;
  } catch (err) {
    addLog(LOG_ERROR, `[Simulator] Simulation run failed: ${err.message}`);
    return false;
  }
}

// Simulator Mock Socket
const socketMock = () => {
  const mock = {
    write: (data, encoding) => {
      const buf = typeof data === 'string' ? Buffer.from(data, encoding || 'binary') : data;
      addLog(LOG_RAW, `Simulator Socket Write: ${formatHexOrAscii(buf)}`);
      
      if (buf.includes(0x05)) { // LIS sends ENQ
        setTimeout(() => {
          addLog(LOG_RAW, 'Simulator Socket Received: <ACK> from machine.');
          if (mock.querySession) {
            handleMockSocketACK(mock);
          }
        }, 150);
      } else if (buf.includes(0x02)) { // LIS sends a frame
        setTimeout(() => {
          addLog(LOG_RAW, 'Simulator Socket Received: <ACK> for frame.');
          if (mock.querySession) {
            handleMockSocketACK(mock);
          }
        }, 150);
      }
    }
  };
  return mock;
};

function handleMockSocketACK(socket) {
  const session = socket.querySession;
  if (session) {
    if (session.state === 'WAITING_ACK_FOR_ENQ') {
      session.currentIdx = 0;
      sendNextQueryFrame(socket);
    } else if (session.state === 'WAITING_ACK_FOR_FRAME') {
      session.currentIdx++;
      if (session.currentIdx < session.frames.length) {
        sendNextQueryFrame(socket);
      } else {
        addLog(LOG_RAW, 'Sending: <EOT> to terminate host query response.');
        socket.write(Buffer.from([0x04]));
        delete socket.querySession;
        addLog(LOG_SYSTEM, '[Host Query Simulation] Host query response completed.');
      }
    }
  }
}

module.exports = {
  initMachineServer,
  startInterfacing,
  stopInterfacing,
  saveConfig,
  getConfig: () => config,
  getStatus: () => status,
  getLogs: () => logs,
  clearLogs: () => { logs = []; return true; },
  runSimulator,
  getOrphans,
  deleteOrphan,
  reconcileOrphan
};
