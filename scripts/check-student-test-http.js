'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const { spawn } = require('child_process');
const { createRoot, createTest, createAssignment } = require('../src/server/exams/testModel');

const ids = {
  creator: '11111111-1111-4111-8111-111111111111',
  student: '22222222-2222-4222-8222-222222222222'
};
const freePort = () => new Promise(resolve => {
  const probe = net.createServer();
  probe.listen(0, '127.0.0.1', () => { const port = probe.address().port; probe.close(() => resolve(port)); });
});
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function ready(base) {
  for (let index = 0; index < 40; index += 1) {
    try { if ((await fetch(`${base}/api/exam/status`)).ok) return; } catch (_) {}
    await wait(100);
  }
  throw Error('servidor no inicio');
}

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'math-attack-student-flow-'));
  const testsFile = path.join(dir, 'pruebas.json');
  const root = createRoot();
  const test = createTest({ testId: '33333333-3333-4333-8333-333333333333', creator: ids.creator, status: 'active', title: 'Prueba visible', configuration: {
    version: 1,
    multiplier: 3,
    total: 2,
    opsConfig: { mult: { tables: [2], ranges: [{ table: 2, from: 3, to: 4 }], manner: 'ordered' } }
  }});
  root.tests.push(test);
  root.assignments.push(createAssignment({ testId: test.testId, targetType: 'student', accountPlayerId: ids.student }));
  fs.writeFileSync(testsFile, JSON.stringify(root), 'utf8');
  fs.writeFileSync(path.join(dir, 'players.json'), JSON.stringify([{ id: ids.student, name: 'Alumno HTTP', pin: '1234', grade: '5A' }]), 'utf8');
  fs.writeFileSync(path.join(dir, 'groups.json'), JSON.stringify({ schemaVersion: 1, groups: [] }), 'utf8');
  const port = await freePort();
  const child = spawn(process.execPath, ['server.js'], { cwd: process.cwd(), env: { ...process.env, PORT: String(port), MATH_ATTACK_TESTS_PATH: testsFile, MATH_ATTACK_DATA_PATH: dir, MATH_ATTACK_GROUPS_PATH: path.join(dir, 'groups.json') }, stdio: 'ignore', windowsHide: true });
  const base = `http://127.0.0.1:${port}`;
  const call = (url, options = {}, cookie = '') => fetch(base + url, { ...options, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}), ...(options.headers || {}) } });
  try {
    await ready(base);
    const login = await call('/api/student/auth', { method: 'POST', body: JSON.stringify({ name: 'Alumno HTTP', pin: '1234' }) });
    assert.strictEqual(login.status, 200);
    const cookie = login.headers.get('set-cookie').split(';')[0];
    const created = await call(`/api/student/tests/${test.testId}/attempts`, { method: 'POST', body: '{}' }, cookie);
    assert.strictEqual(created.status, 201);
    const createdBody = await created.json();
    const attemptId = createdBody.attempt.attemptId;
    assert.strictEqual(createdBody.attempt.test.title, 'Prueba visible');
    assert.strictEqual(createdBody.attempt.progress.questions.length, 2);
    assert.strictEqual(Object.prototype.hasOwnProperty.call(createdBody.attempt.progress.questions[0], 'answer'), false);
    const started = await call(`/api/student/tests/${test.testId}/attempts/${attemptId}/start`, { method: 'POST', body: '{}' }, cookie);
    assert.strictEqual((await started.json()).attempt.status, 'in_progress');
    const question = createdBody.attempt.progress.questions[0];
    const answer = await call(`/api/student/tests/${test.testId}/attempts/${attemptId}/answer`, { method: 'POST', body: JSON.stringify({ questionId: question.questionId, answer: 6, eventId: '44444444-4444-4444-8444-444444444444' }) }, cookie);
    assert.strictEqual((await answer.json()).correct, true);
    const disconnected = await call(`/api/student/tests/${test.testId}/attempts/${attemptId}/disconnect`, { method: 'POST', body: '{}' }, cookie);
    assert.strictEqual((await disconnected.json()).attempt.status, 'disconnected');
    const reconnected = await call(`/api/student/tests/${test.testId}/attempts/${attemptId}/reconnect`, { method: 'POST', body: '{}' }, cookie);
    assert.strictEqual((await reconnected.json()).attempt.status, 'in_progress');
    const finished = await call(`/api/student/tests/${test.testId}/attempts/${attemptId}/finish`, { method: 'POST', body: JSON.stringify({ eventId: '55555555-5555-4555-8555-555555555555' }) }, cookie);
    const finishedBody = await finished.json();
    assert.strictEqual(finishedBody.result.complete, true);
    assert.strictEqual(finishedBody.result.score, 3);
    const duplicate = await call(`/api/student/tests/${test.testId}/attempts/${attemptId}/finish`, { method: 'POST', body: JSON.stringify({ eventId: '55555555-5555-4555-8555-555555555555' }) }, cookie);
    assert.strictEqual((await duplicate.json()).duplicate, true);
    const recovered = await call(`/api/student/tests/${test.testId}/attempts/${attemptId}`, { method: 'GET' }, cookie);
    assert.strictEqual((await recovered.json()).attempt.status, 'finished');
    console.log('OK flujo HTTP aislado del alumno: auth, asignacion, preguntas publicas, respuesta, reconexion, finalizacion e idempotencia');
  } finally {
    child.kill('SIGINT');
    await wait(150);
    fs.rmSync(dir, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exit(1); });
