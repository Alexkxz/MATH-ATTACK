'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { spawn } = require('node:child_process');
const { createRoot, createTest, createAssignment } = require('../src/server/exams/testModel');

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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'math-attack-attempts-'));
  const player = { id: '81818181-8181-4818-8818-818181818181', accountPlayerId: '81818181-8181-4818-8818-818181818181', name: 'Alumno ficticio intentos', pin: '4816', grade: '5A', aureos: 0, experiencia: 0 };
  const accountPlayerId = player.accountPlayerId;
  const root = createRoot();
  const creator = '11111111-1111-4111-8111-111111111111';
  const test = createTest({ title: 'Intento ficticio', creator, status: 'active', configuration: { grade: '5A', total: 1 } });
  const other = createTest({ title: 'Sin asignación ficticia', creator, status: 'active', configuration: { grade: '5A', total: 1 } });
  root.tests.push(test, other);
  root.assignments.push(createAssignment({ testId: test.testId, targetType: 'student', accountPlayerId }));
  for (const [name, value] of Object.entries({
    'pruebas.json': root,
    'players.json': [player],
    'groups.json': { schemaVersion: 1, groups: [], events: [] },
    'ranking.json': [],
    'config.json': { adminUsername: 'admin', adminPassword: 'admin' },
    'devices.json': [], 'aureosLog.json': [],
  })) fs.writeFileSync(path.join(dir, name), JSON.stringify(value), 'utf8');

  const port = await freePort();
  let child;
  try {
    child = spawn(process.execPath, ['server.js'], { cwd: process.cwd(), windowsHide: true, stdio: 'ignore', env: {
      ...process.env,
      PORT: String(port),
      MATH_ATTACK_DATA_PATH: dir,
      MATH_ATTACK_TESTS_PATH: path.join(dir, 'pruebas.json'),
      MATH_ATTACK_GROUPS_PATH: path.join(dir, 'groups.json'),
      MATH_ATTACK_LOG_PATH: path.join(dir, 'server.log'),
    } });
    const base = `http://127.0.0.1:${port}`;
    for (let index = 0; index < 40; index += 1) {
      try { if ((await fetch(`${base}/api/exam/status`)).ok) break; } catch (_) { /* starting */ }
      await wait(100);
    }
    const post = (url, data, cookie = '') => fetch(base + url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: data === undefined ? undefined : JSON.stringify(data) });
    const createUrl = `/api/student/tests/${test.testId}/attempts`;
    assert.equal((await post(createUrl, {})).status, 401, 'creating an attempt requires an authenticated session');
    const login = await post('/api/student/auth', { name: player.name, pin: player.pin, accountPlayerId: '22222222-2222-4222-8222-222222222222' });
    assert.equal(login.status, 200);
    const cookie = login.headers.get('set-cookie').split(';')[0];
    const created = await post(createUrl, { accountPlayerId: '22222222-2222-4222-8222-222222222222' }, cookie);
    assert.equal(created.status, 201);
    const first = await created.json();
    assert.equal(first.attempt.accountPlayerId, accountPlayerId, 'identity must come from the authenticated session');
    assert.equal(first.attempt.status, 'pending');
    const repeated = await post(createUrl, {}, cookie);
    assert.equal(repeated.status, 201, 'the idempotent create endpoint returns the existing attempt');
    const repeatedBody = await repeated.json();
    assert.equal(repeatedBody.attempt.attemptId, first.attempt.attemptId, 'a repeated create must reuse the same attemptId');
    const persisted = JSON.parse(fs.readFileSync(path.join(dir, 'pruebas.json'), 'utf8'));
    assert.equal(persisted.attempts.filter(attempt => attempt.testId === test.testId && attempt.accountPlayerId === accountPlayerId).length, 1, 'a double request must not create duplicate attempts');
    assert.equal((await post(`/api/student/tests/${other.testId}/attempts`, {}, cookie)).status, 403, 'compatible but unassigned student must be denied');
    const startUrl = `/api/student/tests/${test.testId}/attempts/${first.attempt.attemptId}/start`;
    const started = await post(startUrl, {}, cookie);
    assert.equal(started.status, 200);
    assert.equal((await started.json()).attempt.status, 'in_progress');
    const startedAgain = await post(startUrl, {}, cookie);
    assert.equal(startedAgain.status, 200, 'a repeated start continues the same attempt');
    assert.equal((await startedAgain.json()).attempt.attemptId, first.attempt.attemptId);
    console.log('OK: intento usa identidad autenticada y asignación; doble solicitud reutiliza attemptId y no duplica.');
  } finally {
    await stop(child);
    const relative = path.relative(path.resolve(os.tmpdir()), path.resolve(dir));
    assert(relative && !relative.startsWith('..') && !path.isAbsolute(relative), `unsafe temporary fixture cleanup path: ${dir}`);
    fs.rmSync(dir, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exit(1); });
