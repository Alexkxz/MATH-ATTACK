'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { createTestStore } = require('../src/server/exams/testStore');
const { createTest, createAssignment, createAttempt } = require('../src/server/exams/testModel');
const { createTestLibraryService } = require('../src/server/exams/testLibraryService');

const id = () => require('crypto').randomUUID();
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'math-attack-library-'));
  const testsPath = path.join(dir, 'pruebas.json');
  const dataDir = path.join(dir, 'data');
  fs.mkdirSync(dataDir);
  const creator = id(), student = id(), group = 'grupo-5';
  const active = createTest({ testId: id(), title: 'Álgebra activa', status: 'active', creator });
  const finished = createTest({ testId: id(), title: 'Prueba cerrada', status: 'finished', creator });
  const empty = createTest({ testId: id(), title: 'Sin intentos', status: 'scheduled', creator });
  const root = { schemaVersion: 1, tests: [active, finished, empty], assignments: [createAssignment({ testId: active.testId, targetType: 'group', groupId: group }), createAssignment({ testId: finished.testId, targetType: 'student', accountPlayerId: student })], attempts: [createAttempt({ testId: active.testId, accountPlayerId: student, status: 'finished' })], checkpoints: [], results: [], events: [], officialAttempts: [{ testId: active.testId, attemptId: 'not-used', officialAttemptId: id() }], rankingPublications: [{ testId: active.testId, attemptId: 'not-used', rankingPublicationId: id() }] };
  const store = createTestStore({ baseDir: dir, fileName: 'pruebas.json', logger: { error() {} } });
  store.save(root);
  const library = createTestLibraryService({ loadRoot: () => store.load() });
  const listed = library.list({ sort: 'title', direction: 'asc', limit: 10 });
  assert.equal(listed.length, 3);
  assert.equal(listed[0].title, 'Álgebra activa');
  assert.equal(listed[0].attemptCount, 1);
  assert.equal(listed[0].hasOfficialResults, true);
  assert.equal(listed[0].hasRankingPublications, true);
  assert.deepEqual(listed[0].groups, [group]);
  assert(!('configuration' in listed[0]) && !('creator' in listed[0]) && !('responses' in listed[0]));
  assert.equal(library.list({ status: 'finished' })[0].testId, finished.testId);
  assert.equal(library.list({ groupId: group })[0].testId, active.testId);
  assert.equal(library.list({ limit: 1 }).length, 1);
  assert.throws(() => library.list({ status: 'published' }), /status invalido/);
  assert.throws(() => library.list({ limit: 0 }), /limite invalido/);

  const port = await new Promise((resolve, reject) => { const net = require('net'); const probe = net.createServer(); probe.once('error', reject); probe.listen(0, '127.0.0.1', () => { const value = probe.address().port; probe.close(error => error ? reject(error) : resolve(value)); }); });
  const server = spawn(process.execPath, ['server.js'], { cwd: process.cwd(), env: { ...process.env, PORT: String(port), MATH_ATTACK_TESTS_PATH: testsPath, MATH_ATTACK_DATA_PATH: dataDir }, stdio: ['ignore', 'ignore', 'ignore'], windowsHide: true });
  try {
    const base = `http://127.0.0.1:${port}`;
    for (let i = 0; i < 40; i++) { try { if ((await fetch(`${base}/`)).ok) break; } catch (_) {} await wait(100); }
    const noAuth = await fetch(`${base}/api/maestro/tests`);
    assert.equal(noAuth.status, 401);
    const invalid = await fetch(`${base}/api/maestro/tests`, { headers: { 'X-Admin-Password': 'invalid' } });
    assert.equal(invalid.status, 401);
    const response = await fetch(`${base}/api/maestro/tests?status=active&groupId=${encodeURIComponent(group)}&limit=10`, { headers: { 'X-Admin-Password': 'admin' } });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.tests.length, 1);
    assert.equal(body.tests[0].testId, active.testId);
    assert(!JSON.stringify(body).match(/password|token|cookie|session|configuration|responses/i));
    const badFilter = await fetch(`${base}/api/maestro/tests?limit=0`, { headers: { 'X-Admin-Password': 'admin' } });
    assert.equal(badFilter.status, 422);
  } finally { server.kill('SIGINT'); await wait(100); fs.rmSync(dir, { recursive: true, force: true }); }
  console.log('OK: biblioteca administrativa valida auth, filtros, límite, orden, metadatos seguros, publicaciones e aislamiento temporal.');
}

main().catch(error => { console.error(error); process.exit(1); });
