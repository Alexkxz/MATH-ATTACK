'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const net = require('node:net');
const { spawn } = require('node:child_process');
const WebSocket = require('ws');

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const freePort = () => new Promise((resolve, reject) => { const probe = net.createServer(); probe.once('error', reject); probe.listen(0, '127.0.0.1', () => { const port = probe.address().port; probe.close(() => resolve(port)); }); });
const ready = url => new Promise((resolve, reject) => { const started = Date.now(); const probe = () => { const request = http.get(url, response => { response.resume(); if (response.statusCode < 500) return resolve(); retry(); }); request.on('error', retry); }; const retry = () => Date.now() - started > 10000 ? reject(Error('El servidor no inició')) : setTimeout(probe, 40); probe(); });
const eventually = async (predicate, message) => { const started = Date.now(); while (Date.now() - started < 1200) { if (predicate()) return; await wait(20); } throw Error(message); };

class PlayerClient {
  constructor(url, name, grade) {
    this.messages = []; this.ws = new WebSocket(url);
    this.ready = new Promise((resolve, reject) => { this.ws.once('open', resolve); this.ws.once('error', reject); }).then(() => {
      this.ws.on('message', raw => { try { this.messages.push(JSON.parse(String(raw))); } catch (_) {} });
      this.ws.send(JSON.stringify({ type: 'player_identify', name, grade }));
      this.ws.send(JSON.stringify({ type: 'session_update', name, grade, gameMode: 'solo', status: 'playing' }));
    });
  }
  received(type, testId) { return this.messages.some(message => message.type === type && (!testId || message.testId === testId || message.config?.testId === testId)); }
  close() { if (this.ws.readyState === WebSocket.OPEN) this.ws.close(); }
}

(async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'math-attack-simultaneous-exams-'));
  const clients = []; let child;
  try {
    const students = [
      { id: '11111111-1111-4111-8111-111111111111', name: 'Ana', grade: '3° Grado', pin: '1111' },
      { id: '22222222-2222-4222-8222-222222222222', name: 'Beto', grade: '4° Grado', pin: '2222' },
      { id: '33333333-3333-4333-8333-333333333333', name: 'Carla', grade: '6° Grado', pin: '3333' },
    ];
    fs.writeFileSync(path.join(tempDir, 'config.json'), JSON.stringify({ adminUsername: 'admin', adminPassword: 'simultaneous-secret' }));
    fs.writeFileSync(path.join(tempDir, 'players.json'), JSON.stringify(students));
    ['ranking.json', 'aureosLog.json', 'devices.json'].forEach(file => fs.writeFileSync(path.join(tempDir, file), '[]'));
    const port = await freePort();
    child = spawn(process.execPath, ['server.js'], { cwd: path.resolve(__dirname, '..'), env: { ...process.env, PORT: String(port), MATH_ATTACK_DATA_PATH: tempDir, MATH_ATTACK_TESTS_PATH: path.join(tempDir, 'pruebas.json') }, stdio: 'ignore', windowsHide: true });
    const base = `http://127.0.0.1:${port}`, headers = { 'Content-Type': 'application/json', 'X-Admin-Password': 'simultaneous-secret' };
    await ready(`${base}/api/exam/status`);
    for (const student of students) clients.push(new PlayerClient(`ws://127.0.0.1:${port}/ws`, student.name, student.grade));
    await Promise.all(clients.map(client => client.ready));

    const tests = [];
    for (const student of students) {
      const created = await fetch(`${base}/api/exams`, { method: 'POST', headers, body: JSON.stringify({ title: `Prueba ${student.grade}`, configuration: { grade: student.grade, total: 1 } }) });
      const createdData = await created.json(); assert.equal(created.status, 201);
      const test = createdData.test;
      const assignments = await fetch(`${base}/api/exams/${test.testId}/assignments`, { method: 'PUT', headers, body: JSON.stringify({ assignments: [{ targetType: 'student', accountPlayerId: student.id }] }) });
      assert.equal(assignments.status, 200);
      const activated = await fetch(`${base}/api/exams/${test.testId}/state`, { method: 'POST', headers, body: JSON.stringify({ action: 'start', revision: Number(test.revision) + 1 }) });
      const activeData = await activated.json(); assert.equal(activated.status, 200);
      tests.push({ ...activeData.test, student });
    }
    for (const test of tests) {
      const started = await fetch(`${base}/api/exam/start`, { method: 'POST', headers, body: JSON.stringify({ password: 'simultaneous-secret', testId: test.testId, grade: test.student.grade, ops: ['add'], opsConfig: { add: { qty: 1 } }, total: 1 }) });
      assert.equal(started.status, 200);
    }
    for (let index = 0; index < clients.length; index += 1) {
      await eventually(() => clients[index].received('exam_start', tests[index].testId), `El alumno de ${tests[index].student.grade} no recibió su prueba.`);
      tests.forEach((test, otherIndex) => { if (otherIndex !== index) assert.equal(clients[index].received('exam_start', test.testId), false, `${tests[index].student.grade} recibió la prueba de ${test.student.grade}.`); });
    }
    const liveStatus = await (await fetch(`${base}/api/exam/status`)).json();
    assert.equal(liveStatus.examModes.length, 3, 'Deben coexistir tres pruebas activas.');
    const stopped = await fetch(`${base}/api/exam/stop`, { method: 'POST', headers, body: JSON.stringify({ password: 'simultaneous-secret', testId: tests[1].testId }) });
    assert.equal(stopped.status, 200);
    await eventually(() => clients[1].received('exam_stop', tests[1].testId), 'El alumno detenido no recibió exam_stop.');
    assert.equal(clients[0].received('exam_stop', tests[1].testId), false, 'La detención de 4° alcanzó a 3°.');
    assert.equal(clients[2].received('exam_stop', tests[1].testId), false, 'La detención de 4° alcanzó a 6°.');
    const remaining = await (await fetch(`${base}/api/exam/status`)).json();
    assert.equal(remaining.examModes.length, 2, 'Detener una prueba no debe cancelar las demás.');
    console.log('OK: 3°, 4° y 6° reciben sólo su prueba; la detención llega sólo al alumno correspondiente.');
  } finally {
    clients.forEach(client => client.close());
    if (child && !child.killed) { child.kill('SIGINT'); await wait(250); if (!child.killed) child.kill(); }
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exit(1); });
