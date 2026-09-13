'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const { spawn } = require('child_process');
const { createRoot, createTest, createAssignment } = require('../src/server/exams/testModel');

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const freePort = () => new Promise(resolve => { const probe = net.createServer(); probe.listen(0, '127.0.0.1', () => { const port = probe.address().port; probe.close(() => resolve(port)); }); });
async function launch(dir, testId) {
  const port = await freePort();
  const child = spawn(process.execPath, ['server.js'], { cwd: process.cwd(), env: { ...process.env, PORT: String(port), MATH_ATTACK_TESTS_PATH: path.join(dir, 'pruebas.json'), MATH_ATTACK_DATA_PATH: dir, MATH_ATTACK_GROUPS_PATH: path.join(dir, 'groups.json') }, stdio: 'ignore', windowsHide: true });
  const base = `http://127.0.0.1:${port}`;
  for (let index = 0; index < 40; index += 1) { try { if ((await fetch(`${base}/api/exam/status`)).ok) return { child, base }; } catch (_) {} await wait(100); }
  child.kill('SIGINT'); throw Error('servidor no inicio');
}

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'math-attack-student-recovery-'));
  const testId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const studentId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const root = createRoot();
  const test = createTest({ testId, creator: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', status: 'active', title: 'Recuperable', configuration: { version: 1, multiplier: 4, total: 2, opsConfig: { mult: { tables: [2], ranges: [{ table: 2, from: 3, to: 4 }] } } } });
  root.tests.push(test); root.assignments.push(createAssignment({ testId, targetType: 'student', accountPlayerId: studentId }));
  fs.writeFileSync(path.join(dir, 'pruebas.json'), JSON.stringify(root), 'utf8');
  fs.writeFileSync(path.join(dir, 'players.json'), JSON.stringify([{ id: studentId, name: 'Alumno recovery', pin: '1234', grade: '5A' }]), 'utf8');
  fs.writeFileSync(path.join(dir, 'groups.json'), JSON.stringify({ schemaVersion: 1, groups: [] }), 'utf8');
  let running = await launch(dir, testId);
  const call = (base, url, options = {}, cookie = '') => fetch(base + url, { ...options, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}), ...(options.headers || {}) } });
  try {
    let login = await call(running.base, '/api/student/auth', { method: 'POST', body: JSON.stringify({ name: 'Alumno recovery', pin: '1234' }) });
    let cookie = login.headers.get('set-cookie').split(';')[0];
    let created = await call(running.base, `/api/student/tests/${testId}/attempts`, { method: 'POST', body: '{}' }, cookie);
    const attemptId = (await created.json()).attempt.attemptId;
    let started = await call(running.base, `/api/student/tests/${testId}/attempts/${attemptId}/start`, { method: 'POST', body: '{}' }, cookie);
    let startedBody = await started.json();
    const questionId = startedBody.attempt.progress.questions[0].questionId;
    let answer = await call(running.base, `/api/student/tests/${testId}/attempts/${attemptId}/answer`, { method: 'POST', body: JSON.stringify({ questionId, answer: 6, eventId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd' }) }, cookie);
    const answerBody = await answer.json();
    const checkpoint = await call(running.base, `/api/student/tests/${testId}/attempts/${attemptId}/checkpoint`, { method: 'POST', body: JSON.stringify({ index: 1, revision: answerBody.attempt.revision, eventId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', answers: answerBody.attempt.progress.answers, progress: answerBody.attempt.progress }) }, cookie);
    assert.strictEqual(checkpoint.status, 201);
    running.child.kill('SIGINT'); await wait(200);
    running = await launch(dir, testId);
    login = await call(running.base, '/api/student/auth', { method: 'POST', body: JSON.stringify({ name: 'Alumno recovery', pin: '1234' }) });
    cookie = login.headers.get('set-cookie').split(';')[0];
    const recovered = await call(running.base, `/api/student/tests/${testId}/attempts/${attemptId}`, { method: 'GET' }, cookie);
    const recoveredBody = await recovered.json();
    assert.strictEqual(recoveredBody.attempt.status, 'in_progress');
    assert.strictEqual(recoveredBody.attempt.progress.currentIndex, 1);
    assert.strictEqual(recoveredBody.attempt.progress.answers.length, 1);
    assert.strictEqual((await call(running.base, `/api/student/tests/${testId}/attempts/${attemptId}/checkpoint`, { method: 'GET' }, cookie)).status, 200);
    console.log('OK recuperacion de intento: checkpoint, recarga de sesion y reinicio de servidor');
  } finally {
    if (running.child && !running.child.killed) running.child.kill('SIGINT');
    await wait(150); fs.rmSync(dir, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exit(1); });
