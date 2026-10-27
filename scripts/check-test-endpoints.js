'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { randomUUID } = require('node:crypto');
const { spawn } = require('node:child_process');
const { createGroupStore } = require('../src/server/groups/groupStore');
const { createGroupService } = require('../src/server/groups/groupService');

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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'math-attack-exams-http-'));
  const adminPassword = 'fictional-test-admin-5481';
  const studentId = '81818181-8181-4818-8818-818181818181';
  const files = {
    'players.json': [{ id: studentId, accountPlayerId: studentId, name: 'Alumno ficticio API', grade: '3', pin: '4816', aureos: 0, experiencia: 0 }],
    'ranking.json': [], 'aureosLog.json': [], 'devices.json': [],
    'groups.json': { schemaVersion: 1, groups: [], events: [] },
    'config.json': { adminUsername: 'admin', adminPassword },
  };
  for (const [name, value] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), JSON.stringify(value), 'utf8');
  const groupStore = createGroupStore({ baseDir: dir });
  const groupService = createGroupService({ store: groupStore, resolveAccountPlayer: id => id === studentId });
  const group = groupService.create({ actor: 'admin', eventId: randomUUID(), name: 'Grupo ficticio 3', grade: '3', schoolYear: '2030' }).group;
  const testsFile = path.join(dir, 'pruebas.json');
  const groupsFile = path.join(dir, 'groups.json');
  const port = await freePort();
  let child;
  try {
    child = spawn(process.execPath, ['server.js'], { cwd: process.cwd(), windowsHide: true, stdio: 'ignore', env: {
      ...process.env,
      PORT: String(port),
      MATH_ATTACK_DATA_PATH: dir,
      MATH_ATTACK_TESTS_PATH: testsFile,
      MATH_ATTACK_GROUPS_PATH: groupsFile,
      MATH_ATTACK_LOG_PATH: path.join(dir, 'server.log'),
    } });
    const base = `http://127.0.0.1:${port}`;
    for (let index = 0; index < 40; index += 1) {
      try { if ((await fetch(`${base}/api/exam/status`)).ok) break; } catch (_) { /* starting */ }
      await wait(100);
    }
    const call = (method, url, data) => fetch(base + url, { method, headers: { 'Content-Type': 'application/json' }, body: data === undefined ? undefined : JSON.stringify(data) });
    assert.equal((await call('GET', '/api/exams')).status, 401);
    const created = await call('POST', '/api/exams', { password: adminPassword, title: 'Prueba API ficticia', creator: '11111111-1111-4111-8111-111111111111' });
    assert.equal(created.status, 201);
    const testId = (await created.json()).test.testId;
    assert.equal((await call('GET', `/api/exams?pwd=${adminPassword}`)).status, 200);
    assert.equal((await call('GET', `/api/exams/${testId}?pwd=${adminPassword}`)).status, 200);
    assert.equal((await call('PATCH', `/api/exams/${testId}`, { password: adminPassword, revision: 2, title: 'Prueba API editada' })).status, 200);
    assert.equal((await call('PATCH', `/api/exams/${testId}`, { password: adminPassword, revision: 2, title: 'Revisión obsoleta' })).status, 409);
    const assigned = await call('PUT', `/api/exams/${testId}/assignments`, { password: adminPassword, assignments: [{ targetType: 'group', groupId: group.groupId }] });
    assert.equal(assigned.status, 200, 'existing UUID group should remain assignable');
    assert.equal((await call('PUT', `/api/exams/${testId}/assignments`, { password: adminPassword, assignments: {} })).status, 400);
    assert.equal((await call('GET', '/api/exam/status')).status, 200);
    console.log('OK: endpoints HTTP usan stores y grupo ficticios; autenticación, revisión y asignación de grupo UUID.');
  } finally {
    await stop(child);
    const relative = path.relative(path.resolve(os.tmpdir()), path.resolve(dir));
    assert(relative && !relative.startsWith('..') && !path.isAbsolute(relative), `unsafe temporary fixture cleanup path: ${dir}`);
    fs.rmSync(dir, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exit(1); });
