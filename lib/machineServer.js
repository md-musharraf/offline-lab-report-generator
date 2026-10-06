// Analyzer interfacing: receives results from lab machines over LAN (TCP server or client) or
// RS-232 serial, speaking ASTM E1381/E1394 or HL7 v2 over MLLP, and writes them into patient orders.
const fs = require('fs');
const path = require('path');
const net = require('net');

const ENQ = 0x05, ACK = 0x06, NAK = 0x15, EOT = 0x04, STX = 0x02, VT = 0x0b, FS = 0x1c, CR = 0x0d, LF = 0x0a;
const RECONNECT_MS = 5000;
const MAX_BUFFER = 1024 * 1024;

const LOG_SYSTEM = 'SYSTEM';
const LOG_RAW = 'RAW';
const LOG_PARSED = 'PARSED';
const LOG_ERROR = 'ERROR';

let prisma = null;
let getWindow = () => null;
let configFile = null;
let orphanFile = null;
let logs = [];
let status = 'Inactive'; // Inactive | Connecting | Listening | Error
let orphans = []; // results whose barcode matched no order, kept for manual reconciliation
let active = null; // { stop() } of the running transport

let config = {
  connectionType: 'LAN', // LAN | COM
  tcpPort: 5000,
  tcpMode: 'Server', // Server: analyzer connects to us. Client: we connect to the analyzer.
  tcpHost: '127.0.0.1',
  comPort: 'COM1',
  baudRate: 9600,
  dataBits: 8,
  parity: 'none',
  stopBits: 1,
  protocol: 'ASTM', // ASTM | HL7
  bidirectional: true, // answer host queries (order download)
  autoStart: false, // resume interfacing when the app starts (set by Start, cleared by Stop)
  autoApproveNormal: false,
  parameterMapping: {}, // machine code -> LIS parameter id
  valueFactors: {}, // machine code -> multiplier for unit conversion
  testMapping: {}, // LIS test id -> machine test code
};

function send(channel, data) {
  const win = getWindow();
  if (win && !win.isDestroyed()) win.webContents.send(channel, data);
}

function addLog(type, message) {
  const entry = { id: Date.now() + Math.random().toString(36).slice(2, 7), timestamp: new Date().toISOString(), type, message };
  logs.unshift(entry);
  if (logs.length > 200) logs.pop();
  send('machine-log', entry);
  console.log(`[Machine ${type}] ${message}`);
}

function updateStatus(next) {
  status = next;
  send('machine-status', status);
}

const CONTROL_NAMES = { 2: 'STX', 3: 'ETX', 4: 'EOT', 5: 'ENQ', 6: 'ACK', 10: 'LF', 11: 'VT', 13: 'CR', 21: 'NAK', 23: 'ETB', 28: 'FS' };
function formatHexOrAscii(buf) {
  let s = '';
  for (const b of buf) s += CONTROL_NAMES[b] ? `<${CONTROL_NAMES[b]}>` : b >= 32 && b < 127 ? String.fromCharCode(b) : `<${b.toString(16).padStart(2, '0')}>`;
  return s.length > 600 ? `${s.slice(0, 600)}…` : s;
}

// ASTM E1381 checksum: sum of every byte from the frame number through ETX/ETB, modulo 256, as 2 hex digits.
function computeASTMChecksum(body) {
  let sum = 0;
  for (let i = 0; i < body.length; i++) sum = (sum + body.charCodeAt(i)) & 0xff;
  return sum.toString(16).toUpperCase().padStart(2, '0');
}

// One record per frame. ponytail: records over 240 chars should be split with ETB; ours are short.
function buildASTMFrame(frameNo, record) {
  const body = `${frameNo % 8}${record}\r\x03`;
  return `\x02${body}${computeASTMChecksum(body)}\r\n`;
}

// Returns the frame text (without frame number), or null when the checksum is wrong.
function parseASTMFrame(frame) {
  const term = frame.search(/[\x03\x17]/);
  if (term < 2) return null;
  const body = frame.slice(1, term + 1);
  if (frame.slice(term + 1, term + 3).toUpperCase() !== computeASTMChecksum(body)) return null;
  return frame.slice(2, term);
}

// ---------------- CONFIG & ORPHANS ----------------
function readJson(file, legacyName) {
  const legacy = path.join(process.env.APPDATA || process.env.HOME || '', legacyName);
  const source = fs.existsSync(file) ? file : fs.existsSync(legacy) ? legacy : null;
  return source ? JSON.parse(fs.readFileSync(source, 'utf8')) : null;
}

function saveConfig(newConfig) {
  try {
    config = { ...config, ...newConfig };
    fs.mkdirSync(path.dirname(configFile), { recursive: true });
    fs.writeFileSync(configFile, JSON.stringify(config, null, 2));
    addLog(LOG_SYSTEM, 'Interfacing settings saved.');
    return true;
  } catch (err) {
    addLog(LOG_ERROR, `Failed to save settings: ${err.message}`);
    return false;
  }
}

function saveOrphans() {
  try {
    fs.mkdirSync(path.dirname(orphanFile), { recursive: true });
    fs.writeFileSync(orphanFile, JSON.stringify(orphans, null, 2));
    send('orphans-updated', orphans);
  } catch (err) {
    console.error('Failed to save unmatched results:', err);
  }
}

function initMachineServer(prismaInstance, windowGetter, dataDir) {
  prisma = prismaInstance;
  getWindow = windowGetter;
  configFile = path.join(dataDir, 'machine-config.json');
  orphanFile = path.join(dataDir, 'machine-unmatched-results.json');
  try {
    config = { ...config, ...readJson(configFile, 'offline-lab-lis-machine-config.json') };
    orphans = readJson(orphanFile, 'offline-lab-lis-orphan-results.json') || [];
  } catch (err) {
    console.error('Failed to load interfacing settings:', err);
  }
  addLog(LOG_SYSTEM, 'Machine interfacing service ready.');
  // Analyzers stay connected across PC restarts: if interfacing was running, start it again.
  if (config.autoStart && prisma) startInterfacing();
}

// ---------------- LINK (one analyzer conversation) ----------------
// ASTM: ENQ -> ACK, then checksummed frames (each ACKed; ETB continues a record), EOT ends the message.
// Also accepts unframed ASTM records (CR-terminated, ending with an L record) that some LAN analyzers send.
// HL7: MLLP blocks (VT ... FS CR), each answered with an HL7 ACK.
class AnalyzerLink {
  constructor(write, label, protocol = config.protocol) {
    this.write = write;
    this.label = label;
    this.protocol = protocol;
    this.buf = Buffer.alloc(0);
    this.text = '';
    this.outgoing = null; // host-query reply we are transmitting
    this.queue = Promise.resolve();
  }

  // Chunks are processed strictly in order, even while a previous message is being saved.
  receive(chunk) {
    addLog(LOG_RAW, `${this.label} ← ${formatHexOrAscii(chunk)}`);
    this.queue = this.queue
      .then(() => this.process(chunk))
      .catch(err => addLog(LOG_ERROR, `${this.label}: ${err.message}`));
    return this.queue;
  }

  send(data) {
    const buf = typeof data === 'number' ? Buffer.from([data]) : Buffer.from(data, 'latin1');
    addLog(LOG_RAW, `${this.label} → ${formatHexOrAscii(buf)}`);
    this.write(buf);
  }

  consume(n) {
    const head = this.buf.subarray(0, n).toString('latin1');
    this.buf = this.buf.subarray(n);
    return head;
  }

  async process(chunk) {
    this.buf = Buffer.concat([this.buf, chunk]);
    if (this.buf.length > MAX_BUFFER) {
      addLog(LOG_ERROR, `${this.label}: receive buffer overflow, discarding ${this.buf.length} bytes.`);
      this.buf = Buffer.alloc(0);
    }
    return this.protocol === 'HL7' ? this.processHL7() : this.processASTM();
  }

  async processASTM() {
    while (this.buf.length) {
      const b = this.buf[0];
      if (this.outgoing && (b === ACK || b === NAK || b === EOT)) {
        this.consume(1);
        this.onReply(b);
      } else if (b === ENQ) {
        this.consume(1);
        this.text = '';
        this.send(ACK);
      } else if (b === EOT) {
        this.consume(1);
        const message = this.text;
        this.text = '';
        if (message) await this.onMessage(message);
      } else if (b === STX) {
        const end = this.buf.indexOf(LF);
        if (end === -1) return; // rest of the frame not here yet
        const text = parseASTMFrame(this.consume(end + 1));
        if (text === null) {
          addLog(LOG_ERROR, `${this.label}: ASTM checksum mismatch, requesting retransmission (NAK).`);
          this.send(NAK);
        } else {
          this.text += text;
          this.send(ACK);
        }
      } else if (b >= 0x20) {
        const end = this.buf.indexOf(CR);
        if (end === -1) return;
        const record = this.consume(end + 1).trim();
        this.text += `${record}\r`;
        if (record.startsWith('L|')) {
          const message = this.text;
          this.text = '';
          await this.onMessage(message);
        }
      } else {
        this.consume(1); // stray CR/LF/NUL between frames
      }
    }
  }

  async processHL7() {
    for (;;) {
      const start = this.buf.indexOf(VT);
      if (start === -1) {
        this.buf = Buffer.alloc(0);
        return;
      }
      const end = this.buf.indexOf(FS, start + 1);
      if (end === -1) {
        this.buf = this.buf.subarray(start);
        return;
      }
      const message = this.buf.subarray(start + 1, end).toString('latin1');
      this.buf = this.buf.subarray(end + (this.buf[end + 1] === CR ? 2 : 1));
      const isQuery = /^MSH(\|[^|\r]*){7}\|(QBP|QRY)/.test(message);
      const reply = isQuery && !config.bidirectional
        ? generateHL7Ack(message, true)
        : await handleHL7Message(message);
      if (reply) this.send(reply);
    }
  }

  async onMessage(text) {
    const barcode = parseQueryBarcodeFromASTMBuffer(text);
    if (!barcode) return handleASTMBuffer(text);
    if (!config.bidirectional) {
      addLog(LOG_SYSTEM, `[Host Query] Query for ${barcode} ignored: bidirectional mode is off.`);
      return;
    }
    const records = await buildASTMOrderRecords(barcode);
    this.outgoing = { frames: records.map((r, i) => buildASTMFrame(i + 1, r)), idx: -1, retries: 0 };
    await new Promise(r => setTimeout(r, 100)); // let the analyzer settle after its EOT
    this.send(ENQ);
  }

  onReply(b) {
    const o = this.outgoing;
    if (b === EOT) {
      addLog(LOG_ERROR, `${this.label}: analyzer interrupted the order download.`);
      this.outgoing = null;
      return;
    }
    if (b === NAK) {
      if (++o.retries > 6) {
        addLog(LOG_ERROR, `${this.label}: order download abandoned after 6 retries.`);
        this.outgoing = null;
        this.send(EOT);
        return;
      }
      this.send(o.idx < 0 ? ENQ : o.frames[o.idx]);
      return;
    }
    o.retries = 0;
    o.idx++;
    if (o.idx < o.frames.length) {
      this.send(o.frames[o.idx]);
    } else {
      this.outgoing = null;
      this.send(EOT);
      addLog(LOG_SYSTEM, '[Host Query] Order download completed.');
    }
  }
}

// ---------------- TRANSPORTS ----------------
function startTcpServer() {
  const sockets = new Set();
  const server = net.createServer(socket => {
    const label = `${socket.remoteAddress}:${socket.remotePort}`;
    sockets.add(socket);
    socket.setKeepAlive(true, 30000);
    addLog(LOG_SYSTEM, `Analyzer connected from ${label}`);
    const link = new AnalyzerLink(d => socket.write(d), label);
    socket.on('data', d => link.receive(d));
    socket.on('close', () => {
      sockets.delete(socket);
      addLog(LOG_SYSTEM, `Analyzer disconnected: ${label}`);
    });
    socket.on('error', err => addLog(LOG_ERROR, `Socket error from ${label}: ${err.message}`));
  });
  const stop = () => {
    for (const s of sockets) s.destroy();
    server.close();
  };
  server.on('error', err => {
    addLog(LOG_ERROR, `TCP server error on port ${config.tcpPort}: ${err.message}`);
    stop();
    active = null;
    updateStatus('Error');
  });
  server.listen(Number(config.tcpPort), '0.0.0.0', () => {
    updateStatus('Listening');
    addLog(LOG_SYSTEM, `Listening for analyzers on TCP port ${config.tcpPort}`);
  });
  return { stop };
}

// Some analyzers are the TCP server; we dial them and keep redialling if the link drops.
function startTcpClient() {
  const label = `${config.tcpHost}:${config.tcpPort}`;
  let socket = null;
  let timer = null;
  let stopped = false;
  const connect = () => {
    socket = net.createConnection({ host: config.tcpHost, port: Number(config.tcpPort) });
    socket.setKeepAlive(true, 30000);
    const link = new AnalyzerLink(d => socket.write(d), label);
    socket.on('connect', () => {
      updateStatus('Listening');
      addLog(LOG_SYSTEM, `Connected to analyzer at ${label}`);
    });
    socket.on('data', d => link.receive(d));
    socket.on('error', err => addLog(LOG_ERROR, `Connection to ${label}: ${err.message}`));
    socket.on('close', () => {
      if (stopped) return;
      updateStatus('Connecting');
      timer = setTimeout(connect, RECONNECT_MS);
    });
  };
  updateStatus('Connecting');
  connect();
  return {
    stop: () => {
      stopped = true;
      clearTimeout(timer);
      socket?.destroy();
    },
  };
}

// Serial ports (incl. USB-RS232 adapters) are reopened automatically when unplugged and replugged.
function startSerial() {
  const { SerialPort } = require('serialport');
  let port = null;
  let timer = null;
  let stopped = false;
  const retry = () => {
    if (!stopped) timer = setTimeout(open, RECONNECT_MS);
  };
  const open = () => {
    port = new SerialPort({
      path: config.comPort,
      baudRate: Number(config.baudRate),
      dataBits: Number(config.dataBits),
      parity: config.parity,
      stopBits: Number(config.stopBits),
      autoOpen: false,
    });
    const link = new AnalyzerLink(d => port.write(d), config.comPort);
    port.on('data', d => link.receive(d));
    port.on('error', err => addLog(LOG_ERROR, `${config.comPort}: ${err.message}`));
    port.on('close', () => {
      if (stopped) return;
      addLog(LOG_ERROR, `${config.comPort} closed unexpectedly, retrying in ${RECONNECT_MS / 1000}s...`);
      updateStatus('Connecting');
      retry();
    });
    port.open(err => {
      if (err) {
        addLog(LOG_ERROR, `Cannot open ${config.comPort}: ${err.message}`);
        updateStatus('Error');
        retry();
        return;
      }
      updateStatus('Listening');
      addLog(LOG_SYSTEM, `Serial port ${config.comPort} open at ${config.baudRate} baud (${config.dataBits}${config.parity[0].toUpperCase()}${config.stopBits}).`);
    });
  };
  updateStatus('Connecting');
  open();
  return {
    stop: () => {
      stopped = true;
      clearTimeout(timer);
      if (port?.isOpen) port.close();
    },
  };
}

function startInterfacing() {
  if (!config.autoStart) saveConfig({ autoStart: true });
  if (active) {
    addLog(LOG_SYSTEM, 'Interfacing is already active.');
    return true;
  }
  addLog(LOG_SYSTEM, `Starting ${config.connectionType === 'COM' ? `serial ${config.comPort}` : `LAN ${config.tcpMode}`} interface (${config.protocol})...`);
  try {
    active = config.connectionType === 'COM' ? startSerial() : config.tcpMode === 'Client' ? startTcpClient() : startTcpServer();
    return true;
  } catch (err) {
    addLog(LOG_ERROR, `Failed to start interfacing: ${err.message}`);
    updateStatus('Error');
    return false;
  }
}

// remember: false when the app is quitting, so interfacing resumes on the next start.
function stopInterfacing({ remember = true } = {}) {
  if (remember && config.autoStart) saveConfig({ autoStart: false });
  if (active) {
    active.stop();
    active = null;
    addLog(LOG_SYSTEM, 'Interfacing stopped.');
  }
  updateStatus('Inactive');
  return true;
}

async function listSerialPorts() {
  try {
    const { SerialPort } = require('serialport');
    return (await SerialPort.list()).map(p => ({ path: p.path, label: [p.path, p.friendlyName || p.manufacturer].filter(Boolean).join(' — ') }));
  } catch (err) {
    addLog(LOG_ERROR, `Could not list serial ports: ${err.message}`);
    return [];
  }
}

// ---------------- ASTM RECORDS ----------------
const longestComponent = field => (field || '').split('^').map(s => s.trim()).sort((a, b) => b.length - a.length)[0] || '';
const firstComponent = field => (field || '').split('^').map(s => s.trim()).find(Boolean) || '';
const astmRecords = text => text.split(/\r\n?|\n/).map(r => r.trim()).filter(Boolean);

// The specimen id is O-record field 3 (LIS id) or field 4 (instrument id). Analyzers pad it with
// rack/position components ("SID^1^3", "^^ 123456^B"), so take the longest component.
async function handleASTMBuffer(text) {
  let sampleId = null;
  const results = [];
  for (const record of astmRecords(text)) {
    const f = record.split('|');
    if (f[0] === 'O' && !sampleId) {
      sampleId = longestComponent(f[2]) || longestComponent(f[3]) || null;
    } else if (f[0] === 'R') {
      const parameter = firstComponent(f[2]);
      const value = (f[3] || '').split('^')[0].trim();
      if (parameter && value !== '') {
        results.push({ parameter, value, unit: f[4]?.trim() || null, refRange: f[5]?.trim() || null, flag: f[6]?.trim() || null });
      }
    }
  }
  if (!sampleId) {
    addLog(LOG_ERROR, 'ASTM message has no specimen ID (O record). Nothing saved.');
    return;
  }
  addLog(LOG_SYSTEM, `ASTM message parsed. Specimen ${sampleId}, ${results.length} result(s).`);
  await saveResultsToDatabase(sampleId, results);
}

function parseQueryBarcodeFromASTMBuffer(text) {
  const q = astmRecords(text).find(r => r.startsWith('Q|'));
  return q ? longestComponent(q.split('|')[2]) || null : null;
}

async function findOrderForBarcode(barcode, include) {
  const order = await prisma.testOrder.findFirst({ where: { OR: [{ barcodeData: barcode }, { orderNo: barcode }] }, include });
  if (order || !/^\d+$/.test(barcode)) return order;
  return prisma.testOrder.findFirst({ where: { id: parseInt(barcode, 10) }, include });
}

// Order download reply: the tests booked for this barcode, using the analyzer's own test codes.
async function buildASTMOrderRecords(barcode) {
  const header = 'H|\\^&|||JharLab LIS||||||||1394-97';
  const order = prisma ? await findOrderForBarcode(barcode, { patient: true, items: { include: { test: true } } }) : null;
  const codes = [...new Set((order?.items || []).map(i => (config.testMapping?.[i.test.id] || i.test.shortName || i.test.code || '').trim().toUpperCase()).filter(Boolean))];
  const patient = order?.patient;
  const sex = patient?.gender ? patient.gender[0].toUpperCase() : 'U';
  if (!codes.length) {
    addLog(LOG_ERROR, `[Host Query] No tests booked for ${barcode}; sending cancel.`);
    return [header, `P|1||||${patient?.name || ''}||||${sex}`, `O|1|${barcode}||||||||||||||||||||||X`, 'L|1|N'];
  }
  addLog(LOG_SYSTEM, `[Host Query] ${barcode}: sending tests ${codes.join(', ')} for ${patient.name}.`);
  return [
    header,
    `P|1||||${patient.name}||||${sex}`,
    `O|1|${barcode}||${codes.map(c => `^^^${c}`).join('\\')}|R||||||N||||||||||||||O`,
    'L|1|N',
  ];
}

// ---------------- HL7 ----------------
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
  
  {
    send('db-changed', 'qcResult');
    send('qc-saved', {
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
      let targetParameterId = config.parameterMapping[result.parameter] ?? config.parameterMapping[result.parameter.toUpperCase()];
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
      // Per-code unit conversion (e.g. WBC sent in 10^3/uL, reported in cells/cu.mm => x1000).
      const factor = Number(config.valueFactors?.[result.parameter.toUpperCase()]) || 1;
      const rawNum = parseFloat(result.value);
      const valNum = isNaN(rawNum) ? NaN : Number((rawNum * factor).toPrecision(12));
      const valStr = isNaN(rawNum) || factor === 1 ? result.value : String(valNum);
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
      
      {
        send('db-changed', 'testResult');
        send('result-parsed', {
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

// ---------------- SIMULATOR ----------------
// Plays an analyzer against a real AnalyzerLink, so a simulation exercises exactly the code path a
// physical machine would: framing, checksums, ACKs, parsing and saving.
async function runSimulator(type) {
  if (!prisma) {
    addLog(LOG_ERROR, '[Simulator] Database not ready.');
    return false;
  }
  try {
    const order = await prisma.testOrder.findFirst({ orderBy: { createdAt: 'desc' }, include: { patient: true } });
    if (!order && type !== 'QC Simulator') {
      addLog(LOG_ERROR, '[Simulator] Create a patient order first, then run the simulator.');
      return false;
    }
    const barcode = order ? order.barcodeData || order.orderNo : '';
    const ts = new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14);
    const protocol = type.includes('HL7') ? 'HL7' : 'ASTM';
    const link = new AnalyzerLink(buf => {
      if (buf[0] === ENQ || buf[0] === STX) setTimeout(() => link.receive(Buffer.from([ACK])), 20);
    }, '[Simulator]', protocol);
    const feed = async parts => {
      for (const p of parts) await link.receive(Buffer.isBuffer(p) ? p : Buffer.from(typeof p === 'number' ? [p] : p, 'latin1'));
    };
    const astm = records => feed([ENQ, ...records.map((r, i) => buildASTMFrame(i + 1, r)), EOT]);
    const mllp = segments => feed([`\x0b${segments.join('\r')}\x1c\r`]);
    if (order) addLog(LOG_SYSTEM, `[Simulator] ${type} for order ${order.orderNo} (${order.patient.name}).`);

    if (type === 'Mindray ASTM') {
      await astm([
        'H|\\^&|||Mindray BC||||||||1394-97',
        `P|1||||${order.patient.name}`,
        `O|1|${barcode}||^^^CBC|||||||||||||||||||F`,
        `R|1|^^^WBC|7.5|10*9/L|4.0-10.0|N||F||||${ts}`,
        `R|2|^^^RBC|4.85|10*12/L|3.8-5.8|N||F||||${ts}`,
        `R|3|^^^HGB|10.2|g/dL|11.5-16.5|L||F||||${ts}`,
        `R|4|^^^PLT|135|10*9/L|150-400|L||F||||${ts}`,
        'L|1|N',
      ]);
    } else if (type === 'QC Simulator') {
      await astm([
        'H|\\^&|||Mindray BC||||||||1394-97',
        'P|1||||QC Control Level 1',
        'O|1|QC-CONTROL-L1||^^^CBC|||||||||||||||||||F',
        `R|1|^^^WBC|7.9|10*9/L|4.0-10.0|N||F||||${ts}`,
        `R|2|^^^RBC|4.62|10*12/L|3.8-5.8|N||F||||${ts}`,
        `R|3|^^^HGB|13.8|g/dL|11.5-16.5|N||F||||${ts}`,
        `R|4|^^^PLT|220|10*9/L|150-400|N||F||||${ts}`,
        'L|1|N',
      ]);
    } else if (type === 'Mindray ASTM Host Query') {
      await astm(['H|\\^&|||Mindray BS||||||||1394-97', `Q|1|^${barcode}||^^^ALL||||||||O`, 'L|1|N']);
      await new Promise(r => setTimeout(r, 1500)); // let the order download finish
    } else if (type === 'BioChem HL7') {
      await mllp([
        `MSH|^~\\&|ANALYZER||LIS||${ts}||ORU^R01|MSG00091|P|2.3`,
        `PID|1||PID123||${order.patient.name}`,
        `OBR|1|${barcode}|${barcode}|^^^BIO||||||||||||||||||||F`,
        'OBX|1|NM|GLU^Glucose|1|142.5|mg/dL|70-110|H|||F',
        'OBX|2|NM|CREA^Creatinine|1|1.85|mg/dL|0.6-1.2|H|||F',
        'OBX|3|NM|CHOL^Cholesterol|1|195|mg/dL|100-200|N|||F',
      ]);
    } else if (type === 'BioChem HL7 Host Query') {
      await mllp([`MSH|^~\\&|ANALYZER||LIS||${ts}||QBP^Q11|MSG_QUERY|P|2.3`, `QPD|QRY_CBC_GLU|QRY_01|^${barcode}`]);
    } else {
      addLog(LOG_ERROR, `[Simulator] Unknown preset "${type}".`);
      return false;
    }
    return true;
  } catch (err) {
    addLog(LOG_ERROR, `[Simulator] ${err.message}`);
    return false;
  }
}

module.exports = {
  initMachineServer,
  startInterfacing,
  stopInterfacing,
  saveConfig,
  listSerialPorts,
  getConfig: () => config,
  getStatus: () => status,
  getLogs: () => logs,
  clearLogs: () => {
    logs = [];
    return true;
  },
  runSimulator,
  getOrphans,
  deleteOrphan,
  reconcileOrphan,
  // exposed for tests
  AnalyzerLink,
  buildASTMFrame,
  computeASTMChecksum,
  _setPrisma: p => {
    prisma = p;
  },
};
