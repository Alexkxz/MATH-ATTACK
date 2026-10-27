'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { spawn } = require('node:child_process');
const { createRoot, createTest, createAssignment, createAttempt } = require('../src/server/exams/testModel');
const { buildLegacyIdentityMap, resolveAccountPlayerId } = require('../src/server/exams/legacyIdentityAdapter');

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      server.close(error => error ? reject(error) : resolve(port));
    });
  });
}
async function stop(child) {
  if (!child || child.exitCode !== null) return;
  child.kill('SIGINT');
  await Promise.race([new Promise(resolve => child.once('exit', resolve)), wait(3000)]);
  if (child.exitCode === null && child.signalCode === null) child.kill();
}

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'math-attack-cp-http-'));
  const student = { id: '81818181-8181-4818-8818-818181818181', accountPlayerId: '81818181-8181-4818-8818-818181818181', name: 'Alumno ficticio checkpoint', pin: '4816', grade: '5A' };
  const players = [student];
  const account = resolveAccountPlayerId(student, buildLegacyIdentityMap(players));
  const testsFile = path.join(dir, 'pruebas.json');
  const root = createRoot();
  const creator = '11111111-1111-4111-8111-111111111111';
  const test = createTest({ title: 'Checkpoint ficticio', creator, status: 'active', configuration: { grade: '5A', total: 2 } });
  const attempt = createAttempt({ testId: test.testId, accountPlayerId: account, status: 'in_progress' });
  root.tests.push(test);
  root.assignments.push(createAssignment({ testId: test.testId, targetType: 'student', accountPlayerId: account }));
  root.attempts.push(attempt);
  for (const [name, value] of Object.entries({
    'pruebas.json': root,
    'players.json': players,
    'groups.json': { schemaVersion: 1, groups: [] },
    'ranking.json': [],
    'config.json': { adminUsername: 'admin', adminPassword: 'admin' },
    'devices.json': [],
    'aureosLog.json': [],
  })) fs.writeFileSync(path.join(dir, name), JSON.stringify(value), 'utf8');

  let child;
  try {
    const port = await freePort();
    child = spawn(process.execPath, ['server.js'], { cwd: process.cwd(), windowsHide: true, stdio: 'ignore', env: {
      ...process.env,
      PORT: String(port),
      MATH_ATTACK_DATA_PATH: dir,
      MATH_ATTACK_TESTS_PATH: testsFile,
      MATH_ATTACK_GROUPS_PATH: path.join(dir, 'groups.json'),
      MATH_ATTACK_LOG_PATH: path.join(dir, 'server.log'),
    } });
    const base = `http://127.0.0.1:${port}`;
    const url = `/api/student/tests/${test.testId}/attempts/${attempt.attemptId}/checkpoint`;
    for (let index = 0; index < 40; index += 1) {
      try { if ((await fetch(`${base}/api/exam/status`)).ok) break; } catch (_) { /* starting */ }
      await wait(100);
    }
    const post = (endpoint, body, cookie = '') => fetch(base + endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: JSON.stringify(body) });
    assert.equal((await post(url, {})).status, 401, 'checkpoint requires an authenticated student session');
    const login = await post('/api/student/auth', { name: student.name, pin: student.pin });
    assert.equal(login.status, 200);
    const cookie = login.headers.get('set-cookie').split(';')[0];
    const data = { index: 0, revision: 1, eventId: '55555555-5555-4555-8555-555555555555', accountPlayerId: 'client-value-is-ignored' };
    const first = await post(url, data, cookie);
    assert.equal(first.status, 201);
    const body = await first.json();
    assert.equal(body.checkpoint.attemptId, attempt.attemptId);
    assert.equal(body.checkpoint.accountPlayerId, account);
    assert.equal((await fetch(base + url, { headers: { Cookie: cookie } })).status, 200);
    assert.equal((await fetch(base + url + '/1', { headers: { Cookie: cookie } })).status, 200);
    assert.equal((await post(url, data, cookie)).status, 200, 'retry with the same event should be idempotent');
    assert.equal((await post(url, { ...data, eventId: '66666666-6666-4666-8666-666666666666', revision: 1 }, cookie)).status, 409, 'same revision with a different event must conflict');
    console.log('OK: endpoint checkpoint usa fixture ficticio, verifica asignación y sesión, conserva attemptId y deduplica reintentos.');
  } finally {
    await stop(child);
    const relative = path.relative(path.resolve(os.tmpdir()), path.resolve(dir));
    assert(relative && !relative.startsWith('..') && !path.isAbsolute(relative), `unsafe temporary fixture cleanup path: ${dir}`);
    fs.rmSync(dir, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exit(1); });
