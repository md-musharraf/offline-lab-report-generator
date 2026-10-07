// Analyzer interfacing over a real TCP socket into a real SQLite database: a fake instrument speaks
// ASTM E1381/E1394 and HL7/MLLP exactly as a Mindray/Sysmex would, and we check what lands in the DB.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const { PrismaClient } = require('../prisma/client');
const { ensureSchema } = require('../lib/server-api');
const ms = require('../lib/machineServer');

const ENQ = 0x05, ACK = 0x06, NAK = 0x15, EOT = 0x04;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'jharlab-analyzer-'));
const prisma = new PrismaClient({ datasources: { db: { url: `file:${path.join(tmp, 'test.db').replace(/\\/g, '/')}` } } });
let port;

// Minimal fake instrument: queues every byte the LIS sends so tests can await specific replies.
function instrument() {
  const socket = net.createConnection({ port });
  let inbox = Buffer.alloc(0);
  const waiters = [];
  socket.on('data', d => {
    inbox = Buffer.concat([inbox, d]);
    waiters.splice(0).forEach(w => w());
  });
  const read = async n => {
    while (inbox.length < n) await new Promise((res, rej) => { waiters.push(res); setTimeout(() => rej(new Error(`timeout waiting for ${n} byte(s), have ${inbox.toString('latin1')}`)), 4000); });
    const out = inbox.subarray(0, n);
    inbox = inbox.subarray(n);
    return out;
  };
  const readUntil = async byte => {
    while (inbox.indexOf(byte) === -1) await new Promise((res, rej) => { waiters.push(res); setTimeout(() => rej(new Error('timeout')), 4000); });
    return read(inbox.indexOf(byte) + 1);
  };
  return {
    connected: new Promise(r => socket.on('connect', r)),
    write: data => socket.write(typeof data === 'number' ? Buffer.from([data]) : Buffer.from(data, 'latin1')),
    read,
    readUntil,
    close: () => socket.destroy(),
  };
}

const waitFor = async (fn, ms = 4000) => {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) throw new Error('condition not met in time');
    await new Promise(r => setTimeout(r, 50));
  }
};

async function seed() {
  await prisma.user.create({ data: { name: 'Owner', email: 'o@lab.test', password: 'x', role: 'SUPER_ADMIN' } });
  const cat = await prisma.testCategory.create({ data: { name: 'Hematology' } });
  const cbc = await prisma.test.create({
    data: {
      code: 'HEM001', name: 'Complete Blood Count', shortName: 'CBC', categoryId: cat.id, price: 350, duration: 2, sampleType: 'Blood',
      parameters: {
        create: [
          { name: 'Total Leucocytes', shortName: 'WBC', sortOrder: 1, refRanges: { create: [{ normalMin: 4, normalMax: 11 }] } },
          { name: 'Hemoglobin', shortName: 'HGB', sortOrder: 2, refRanges: { create: [{ normalMin: 11.5, normalMax: 16.5, criticalMin: 7 }] } },
          { name: 'Glucose', shortName: 'GLU', sortOrder: 3, refRanges: { create: [{ normalMin: 70, normalMax: 110 }] } },
        ],
      },
    },
  });
  await prisma.patient.create({ data: { id: 'LAB-2026-00001', name: 'Rajesh Kumar', age: 45, gender: 'MALE', mobile: '9876543210', createdBy: 1 } });
  for (const barcode of ['BC1001', 'BC1002']) {
    await prisma.testOrder.create({
      data: { orderNo: `ORD-${barcode}`, barcodeData: barcode, patientId: 'LAB-2026-00001', items: { create: [{ testId: cbc.id }] } },
    });
  }
}

const resultsFor = barcode => prisma.testResult.findMany({ where: { orderItem: { order: { barcodeData: barcode } } } });

before(async () => {
  await ensureSchema(prisma, fs.readFileSync(path.join(__dirname, '..', 'prisma', 'schema.sql'), 'utf8'));
  await seed();
  port = await new Promise(r => { const s = net.createServer().listen(0, () => { const p = s.address().port; s.close(() => r(p)); }); });
  ms.initMachineServer(prisma, () => null, tmp);
});

after(async () => {
  ms.stopInterfacing();
  await prisma.$disconnect();
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('checksum is the byte sum of frame number..ETX modulo 256', () => {
  const body = '1H|\\^&|||Analyzer\r\x03';
  const expected = [...Buffer.from(body, 'latin1')].reduce((a, b) => a + b, 0) % 256;
  assert.equal(parseInt(ms.computeASTMChecksum(body), 16), expected);
  const frame = ms.buildASTMFrame(1, 'H|\\^&|||Analyzer');
  assert.equal(frame, `\x02${body}${ms.computeASTMChecksum(body)}\r\n`);
});

test('ASTM over TCP: handshake, per-frame ACK, NAK on bad checksum, ETB continuation, results saved', async () => {
  ms.saveConfig({ connectionType: 'LAN', tcpMode: 'Server', tcpPort: port, protocol: 'ASTM', bidirectional: true });
  assert.equal(ms.startInterfacing(), true);
  await waitFor(() => ms.getStatus() === 'Listening');

  const dev = instrument();
  await dev.connected;
  dev.write(ENQ);
  assert.equal((await dev.read(1))[0], ACK);

  const send = async frame => { dev.write(frame); return (await dev.read(1))[0]; };
  assert.equal(await send(ms.buildASTMFrame(1, 'H|\\^&|||Mindray BC-5000||||||||1394-97')), ACK);
  assert.equal(await send(ms.buildASTMFrame(2, 'P|1||||Rajesh Kumar')), ACK);
  assert.equal(await send(ms.buildASTMFrame(3, 'O|1|BC1001^1^5||^^^CBC|||||||||||||||||||F')), ACK);

  const corrupted = ms.buildASTMFrame(4, 'R|1|^^^WBC|7.5|10*9/L|4.0-11.0|N||F').replace(/..\r\n$/, '00\r\n');
  assert.equal(await send(corrupted), NAK, 'bad checksum must be NAKed');
  assert.equal(await send(ms.buildASTMFrame(4, 'R|1|^^^WBC|7.5|10*9/L|4.0-11.0|N||F')), ACK, 'retransmission accepted');

  // One record split over an intermediate (ETB) frame and a final (ETX) frame.
  const part1 = '5R|2|^^^HGB|10.';
  const etbFrame = `\x02${part1}\x17${ms.computeASTMChecksum(`${part1}\x17`)}\r\n`;
  assert.equal(await send(etbFrame), ACK);
  const part2 = '6' + '2|g/dL|11.5-16.5|L||F\r\x03';
  assert.equal(await send(`\x02${part2}${ms.computeASTMChecksum(part2)}\r\n`), ACK);
  assert.equal(await send(ms.buildASTMFrame(7, 'L|1|N')), ACK);
  dev.write(EOT);

  const rows = await waitFor(async () => { const r = await resultsFor('BC1001'); return r.length === 2 && r; });
  const byValue = Object.fromEntries(rows.map(r => [r.numericValue, r]));
  assert.ok(byValue[7.5], 'WBC saved');
  assert.equal(byValue[7.5].isAbnormal, false);
  assert.ok(byValue[10.2], 'HGB reassembled across ETB frames');
  assert.equal(byValue[10.2].flag, '↓');
  assert.equal(byValue[10.2].isAbnormal, true);
  const order = await prisma.testOrder.findFirst({ where: { barcodeData: 'BC1001' } });
  assert.equal(order.status, 'RESULT_ENTERED', 'same status as manual entry, so it is listed under Results and Reports');
  dev.close();
});

test('ASTM host query: LIS downloads the booked tests with its own ENQ/frames/EOT', async () => {
  const dev = instrument();
  await dev.connected;
  dev.write(ENQ);
  assert.equal((await dev.read(1))[0], ACK);
  for (const [i, r] of ['H|\\^&|||Mindray BS-240', 'Q|1|^BC1002||^^^ALL||||||||O', 'L|1|N'].entries()) {
    dev.write(ms.buildASTMFrame(i + 1, r));
    assert.equal((await dev.read(1))[0], ACK);
  }
  dev.write(EOT);

  assert.equal((await dev.read(1))[0], ENQ, 'LIS opens its own transmission');
  dev.write(ACK);
  const records = [];
  for (;;) {
    const first = await dev.read(1);
    if (first[0] === EOT) break;
    const frame = Buffer.concat([first, await dev.readUntil(0x0a)]).toString('latin1');
    const term = frame.indexOf('\x03');
    assert.equal(frame.slice(term + 1, term + 3), ms.computeASTMChecksum(frame.slice(1, term + 1)), 'LIS frames carry valid checksums');
    records.push(frame.slice(2, term).trim());
    dev.write(ACK);
  }
  const orderRecord = records.find(r => r.startsWith('O|'));
  assert.match(orderRecord, /^O\|1\|BC1002\|\|\^\^\^CBC\|/);
  assert.match(records.find(r => r.startsWith('P|')), /Rajesh Kumar/);
  dev.close();
});

test('unframed ASTM records (no ENQ/STX) are also accepted', async () => {
  const dev = instrument();
  await dev.connected;
  dev.write('H|\\^&|||Erba\rP|1\rO|1|BC1002||^^^GLU\rR|1|^^^GLU|142|mg/dL|70-110|H\rL|1|N\r');
  const rows = await waitFor(async () => { const r = await resultsFor('BC1002'); return r.length === 1 && r; });
  assert.equal(rows[0].numericValue, 142);
  assert.equal(rows[0].flag, '↑');
  dev.close();
});

test('mapped codes apply the unit factor (WBC 10^3/uL -> cells/cu.mm)', async () => {
  const wbc = await prisma.testParameter.findFirst({ where: { shortName: 'WBC' } });
  ms.saveConfig({ parameterMapping: { WBCX: wbc.id }, valueFactors: { WBCX: 1000 } });
  const dev = instrument();
  await dev.connected;
  dev.write('H|\\^&|||Mindray\rO|1|BC1002||^^^CBC\rR|1|^^^wbcx|7.5|10*3/uL\rL|1|N\r');
  const row = await waitFor(async () => (await resultsFor('BC1002')).find(r => r.parameterId === wbc.id));
  assert.equal(row.numericValue, 7500);
  assert.equal(row.isAbnormal, true, '7500 is above the 4-11 test range, proving the factor was applied before flagging');
  ms.saveConfig({ parameterMapping: {}, valueFactors: {} });
  dev.close();
});

test('HL7 over MLLP: results saved and ACKed with MSA|AA; unknown barcode goes to unmatched list', async () => {
  ms.stopInterfacing();
  ms.saveConfig({ protocol: 'HL7' });
  ms.startInterfacing();
  await waitFor(() => ms.getStatus() === 'Listening');
  const dev = instrument();
  await dev.connected;
  const msg = ['MSH|^~\\&|BS240||LIS||20261006120000||ORU^R01|M1|P|2.3', 'OBR|1|BC1002|BC1002', 'OBX|1|NM|HGB^Hemoglobin||6.1|g/dL|11.5-16.5|L|||F'].join('\r');
  dev.write(`\x0b${msg}\x1c\r`);
  const ack = (await dev.readUntil(0x0d)).toString('latin1') + (await dev.readUntil(0x0d)).toString('latin1');
  assert.match(ack, /MSA\|AA\|M1/);
  const hgb = await waitFor(async () => (await resultsFor('BC1002')).find(r => r.numericValue === 6.1));
  assert.equal(hgb.isCritical, true, 'below critical minimum');

  const orphanMsg = ['MSH|^~\\&|BS240||LIS||20261006120000||ORU^R01|M2|P|2.3', 'OBR|1|NOPE-404|NOPE-404', 'OBX|1|NM|GLU||99|mg/dL'].join('\r');
  dev.write(`\x0b${orphanMsg}\x1c\r`);
  await dev.readUntil(0x1c);
  await waitFor(() => ms.getOrphans().some(o => o.barcode === 'NOPE-404'));
  dev.close();
});

test('a missing serial port reports an error instead of crashing', async () => {
  ms.stopInterfacing();
  ms.saveConfig({ connectionType: 'COM', comPort: 'COM250', protocol: 'ASTM' });
  assert.equal(ms.startInterfacing(), true);
  await waitFor(() => ms.getStatus() === 'Error');
  assert.ok(ms.getLogs().some(l => l.type === 'ERROR' && l.message.includes('COM250')));
  ms.stopInterfacing();
  assert.equal(ms.getStatus(), 'Inactive');
});
