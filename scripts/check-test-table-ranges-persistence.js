'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { randomUUID } = require('crypto');
const { spawn } = require('child_process');
const { getFreePort, wait } = (() => {
  const net = require('net');
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const getFreePort = () => new Promise((resolve, reject) => { const server = net.createServer(); server.once('error', reject); server.listen(0, '127.0.0.1', () => { const port = server.address().port; server.close(() => resolve(port)); }); });
  return { getFreePort, wait };
})();

async function start(dir, port) {
  const child = spawn(process.execPath, ['server.js'], { cwd: process.cwd(), env: { ...process.env, PORT: String(port), MATH_ATTACK_TESTS_PATH: path.join(dir, 'pruebas.json'), MATH_ATTACK_DATA_PATH: dir }, stdio: 'ignore', windowsHide: true });
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 50; i += 1) { try { if ((await fetch(`${base}/api/exam/status`)).ok) return { child, base }; } catch (_) {} await wait(100); }
  child.kill('SIGINT'); throw new Error('servidor temporal no inició');
}
async function json(base, url, options = {}) { const response = await fetch(base + url, options); return { response, body: await response.json() }; }

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'math-attack-table-ranges-'));
  let server;
  const auth = { 'X-Admin-Password': 'admin', 'Content-Type': 'application/json' };
  const creator = randomUUID();
  try {
    const first = await start(dir, await getFreePort()); server = first;
    const created = await json(server.base, '/api/exams', { method: 'POST', headers: auth, body: JSON.stringify({ title: 'Rangos persistentes', creator, configuration: { grade: '5A', opsConfig: { mult: { tables: [8], ranges: [{ table: 8, from: 1, to: 5 }], manner: 'ordered' } } } }) });
    assert.strictEqual(created.response.status, 201); const testId = created.body.test.testId;
    const updated = await json(server.base, `/api/exams/${testId}`, { method: 'PATCH', headers: auth, body: JSON.stringify({ revision: 2, title: 'Rangos persistentes editada', configuration: { grade: '5A', opsConfig: { mult: { tables: [8, 9], ranges: [{ table: 8, from: 1, to: 5 }, { table: 9, from: 4, to: 9 }], manner: 'random', repeat: false } } } }) });
    assert.strictEqual(updated.response.status, 200); assert.strictEqual(updated.body.test.configuration.grade, '5A'); assert.deepStrictEqual(updated.body.test.configuration.opsConfig.mult.ranges.length, 2);
    const invalid = await json(server.base, `/api/exams/${testId}`, { method: 'PATCH', headers: auth, body: JSON.stringify({ revision: 3, configuration: { opsConfig: { mult: { tables: [8], ranges: [{ table: 8, from: 5, to: 1 }] } } } }) });
    assert.strictEqual(invalid.response.status, 422);
    server.child.kill('SIGINT'); await wait(150); server = await start(dir, await getFreePort());
    const recovered = await json(server.base, `/api/exams/${testId}`, { headers: { 'X-Admin-Password': 'admin' } });
    assert.strictEqual(recovered.response.status, 200); assert.deepStrictEqual(recovered.body.test.configuration.opsConfig.mult.ranges, updated.body.test.configuration.opsConfig.mult.ranges); assert.strictEqual(recovered.body.test.configuration.grade, '5A');
    const edited = await json(server.base, `/api/exams/${testId}`, { method: 'PATCH', headers: auth, body: JSON.stringify({ revision: recovered.body.test.revision + 1, configuration: { grade: '5A', opsConfig: { mult: { tables: [8], ranges: [{ table: 8, from: 2, to: 2 }], manner: 'ordered' } } } }) });
    assert.strictEqual(edited.response.status, 200); assert.deepStrictEqual(edited.body.test.configuration.opsConfig.mult.ranges, [{ table: 8, from: 2, to: 2 }]);
    console.log('check-test-table-ranges-persistence: ok');
  } finally { if (server?.child) server.child.kill('SIGINT'); await wait(100); fs.rmSync(dir, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exit(1); });
