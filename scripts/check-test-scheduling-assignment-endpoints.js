'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function start(dir, port) {
  const child = spawn(process.execPath, ['server.js'], { cwd: process.cwd(), env: { ...process.env, PORT: String(port), MATH_ATTACK_TESTS_PATH: path.join(dir, 'pruebas.json'), MATH_ATTACK_DATA_PATH: path.join(dir, 'data') }, stdio: ['ignore', 'ignore', 'ignore'], windowsHide: true });
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 60; i++) { try { if ((await fetch(`${base}/`)).ok) return { child, base }; } catch (_) {} await wait(100); }
  child.kill('SIGINT'); throw Error('servidor temporal no inició');
}
const json = (base, url, options = {}) => fetch(base + url, { ...options, headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } });

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'math-attack-schedule-endpoints-')); fs.mkdirSync(path.join(dir, 'data'));
  const creator = '11111111-1111-4111-8111-111111111111'; const student = '22222222-2222-4222-8222-222222222222';
  let port = 18080 + Math.floor(Math.random() * 1000); let server;
  try {
    server = await start(dir, port); const auth = { 'X-Admin-Password': 'admin' };
    const created = await json(server.base, '/api/exams', { method: 'POST', headers: auth, body: JSON.stringify({ title: 'Programación HTTP', creator, configuration: {} }) });
    assert.equal(created.status, 201); const test = (await created.json()).test;
    const noAuth = await json(server.base, `/api/exams/${test.testId}/schedule`, { method: 'POST', body: JSON.stringify({ revision: 2, startsAt: '2030-01-01T10:00:00.000Z' }) }); assert.equal(noAuth.status, 401);
    const badAuth = await json(server.base, `/api/exams/${test.testId}/schedule`, { method: 'POST', headers: { 'X-Admin-Password': 'bad' }, body: JSON.stringify({ revision: 2, startsAt: '2030-01-01T10:00:00.000Z' }) }); assert.equal(badAuth.status, 401);
    const invalidDate = await json(server.base, `/api/exams/${test.testId}/schedule`, { method: 'POST', headers: auth, body: JSON.stringify({ revision: 2, startsAt: 'not-a-date' }) }); assert.equal(invalidDate.status, 422);
    const scheduled = await json(server.base, `/api/exams/${test.testId}/schedule`, { method: 'POST', headers: auth, body: JSON.stringify({ revision: 2, startsAt: '2030-01-01T10:00:00.000Z', closesAt: '2030-01-01T11:00:00.000Z' }) }); assert.equal(scheduled.status, 200); const scheduledBody = await scheduled.json(); assert.equal(scheduledBody.test.status, 'scheduled'); assert.equal(scheduledBody.test.startsAt, '2030-01-01T10:00:00.000Z'); assert(!JSON.stringify(scheduledBody).match(/password|token|cookie|session/i));
    const tooEarly = await json(server.base, `/api/exams/${test.testId}/state`, { method: 'POST', headers: auth, body: JSON.stringify({ action: 'start', revision: 3, now: '2029-12-31T10:00:00.000Z' }) }); assert.equal(tooEarly.status, 422); const tooEarlyBody = await tooEarly.json(); assert.match(tooEarlyBody.error, /too early/); assert.equal(tooEarlyBody.ok, false); const unchanged = await (await json(server.base, `/api/exams/${test.testId}`, { headers: auth })).json(); assert.equal(unchanged.test.status, 'scheduled'); assert.equal(unchanged.test.startsAt, '2030-01-01T10:00:00.000Z');
    const active = await json(server.base, `/api/exams/${test.testId}/state`, { method: 'POST', headers: auth, body: JSON.stringify({ action: 'start', revision: 3, now: '2030-01-01T10:00:00.000Z' }) }); assert.equal(active.status, 200); assert.equal((await active.json()).test.status, 'active');
    const validAssignments = await json(server.base, `/api/exams/${test.testId}/assignments`, { method: 'PUT', headers: auth, body: JSON.stringify({ assignments: [{ targetType: 'student', accountPlayerId: student }, { targetType: 'group', groupId: '5A' }] }) }); assert.equal(validAssignments.status, 200); assert.equal((await validAssignments.json()).assignments.length, 2);
    const duplicate = await json(server.base, `/api/exams/${test.testId}/assignments`, { method: 'PUT', headers: auth, body: JSON.stringify({ assignments: [{ targetType: 'student', accountPlayerId: student }, { targetType: 'student', accountPlayerId: student }] }) }); assert.equal(duplicate.status, 422);
    const invalidStudent = await json(server.base, `/api/exams/${test.testId}/assignments`, { method: 'PUT', headers: auth, body: JSON.stringify({ assignments: [{ targetType: 'student', accountPlayerId: 'not-an-id' }] }) }); assert.equal(invalidStudent.status, 422);
    const invalidGroup = await json(server.base, `/api/exams/${test.testId}/assignments`, { method: 'PUT', headers: auth, body: JSON.stringify({ assignments: [{ targetType: 'group', groupId: '' }] }) }); assert.equal(invalidGroup.status, 422);
    const assignments = await (await json(server.base, `/api/exams/${test.testId}/assignments`, { headers: auth })).json(); assert.equal(assignments.assignments.length, 2); assert(!JSON.stringify(assignments).match(/password|token|cookie|session/i));
    server.child.kill('SIGINT'); await wait(150); server = await start(dir, port + 1); port += 1; const recovered = await (await json(server.base, `/api/exams/${test.testId}/assignments`, { headers: auth })).json(); assert.equal(recovered.assignments.length, 2);
    console.log('OK: endpoints de programación y asignación validan auth, fechas, estados, alumno/grupo, duplicados, persistencia, recuperación y cuerpos seguros.');
  } finally { if (server?.child) server.child.kill('SIGINT'); fs.rmSync(dir, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exit(1); });
