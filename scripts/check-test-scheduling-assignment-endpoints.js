'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
function stop(child) {
  if (!child || child.exitCode !== null) return Promise.resolve();
  return new Promise(resolve => {
    child.once('exit', resolve);
    child.kill('SIGINT');
    setTimeout(() => { if (child.exitCode === null) child.kill('SIGKILL'); }, 3000).unref();
  });
}
async function start(dir, port) {
  const child = spawn(process.execPath, ['server.js'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(port),
      MATH_ATTACK_TESTS_PATH: path.join(dir, 'pruebas.json'),
      MATH_ATTACK_GROUPS_PATH: path.join(dir, 'groups.json'),
      MATH_ATTACK_DATA_PATH: path.join(dir, 'data'),
      MATH_ATTACK_LOG_PATH: path.join(dir, 'server.log'),
    },
    stdio: ['ignore', 'ignore', 'ignore'],
    windowsHide: true,
  });
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 80; i++) {
    try { if ((await fetch(`${base}/`)).ok) return { child, base }; } catch (_) {}
    if (child.exitCode !== null) throw Error(`servidor temporal terminó al iniciar (${child.exitCode})`);
    await wait(100);
  }
  await stop(child);
  throw Error('servidor temporal no inició');
}
const json = (base, url, options = {}) => fetch(base + url, {
  ...options,
  headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
});
const bodyOf = response => response.json();

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'math-attack-schedule-endpoints-'));
  const dataDir = path.join(dir, 'data');
  fs.mkdirSync(dataDir, { recursive: true });

  const creator = '11111111-1111-4111-8111-111111111111';
  const student = '22222222-2222-4222-8222-222222222222';
  const groupStudent = '33333333-3333-4333-8333-333333333333';
  const incompatibleStudent = '44444444-4444-4444-8444-444444444444';
  const groupId = '55555555-5555-4555-8555-555555555555';

  // Persistencia completamente ficticia y aislada del árbol del proyecto.
  fs.writeFileSync(path.join(dataDir, 'players.json'), JSON.stringify([
    { id: student, name: 'Alumna Compatible', grade: '5 Primaria' },
    { id: groupStudent, name: 'Alumno del Grupo', grade: '5° primaria' },
    { id: incompatibleStudent, name: 'Alumno de Otro Grado', grade: '6 Primaria' },
  ], null, 2));
  fs.writeFileSync(path.join(dir, 'groups.json'), JSON.stringify({
    schemaVersion: 1,
    groups: [{
      groupId,
      name: 'Grupo Ficticio 5',
      grade: '5 Primaria',
      schoolYear: '2026',
      status: 'active',
      memberAccountPlayerIds: [groupStudent],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      revision: 1,
      history: [],
    }],
    events: [],
  }, null, 2));

  let port = 18080 + Math.floor(Math.random() * 1000);
  let server;
  try {
    server = await start(dir, port);
    const auth = { 'X-Admin-Password': 'admin' };
    const created = await json(server.base, '/api/exams', {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({
        title: 'Programación HTTP ficticia',
        creator,
        configuration: { grade: '5° Primaria' },
      }),
    });
    assert.equal(created.status, 201);
    const test = (await bodyOf(created)).test;
    const testUrl = `/api/exams/${test.testId}`;
    const scheduleUrl = `${testUrl}/schedule`;
    const stateUrl = `${testUrl}/state`;
    const assignmentsUrl = `${testUrl}/assignments`;

    const noAuth = await json(server.base, scheduleUrl, {
      method: 'POST',
      body: JSON.stringify({ revision: 2, startsAt: '2030-01-01T10:00:00.000Z' }),
    });
    assert.equal(noAuth.status, 401);
    const badAuth = await json(server.base, scheduleUrl, {
      method: 'POST',
      headers: { 'X-Admin-Password': 'bad' },
      body: JSON.stringify({ revision: 2, startsAt: '2030-01-01T10:00:00.000Z' }),
    });
    assert.equal(badAuth.status, 401);
    const invalidDate = await json(server.base, scheduleUrl, {
      method: 'POST', headers: auth,
      body: JSON.stringify({ revision: 2, startsAt: 'not-a-date' }),
    });
    assert.equal(invalidDate.status, 422);

    const scheduled = await json(server.base, scheduleUrl, {
      method: 'POST', headers: auth,
      body: JSON.stringify({
        revision: 2,
        startsAt: '2030-01-01T10:00:00.000Z',
        closesAt: '2030-01-01T11:00:00.000Z',
      }),
    });
    assert.equal(scheduled.status, 200);
    const scheduledBody = await bodyOf(scheduled);
    assert.equal(scheduledBody.test.status, 'scheduled');
    assert.equal(scheduledBody.test.startsAt, '2030-01-01T10:00:00.000Z');
    assert(!/password|token|cookie|session/i.test(JSON.stringify(scheduledBody)));

    const tooEarly = await json(server.base, stateUrl, {
      method: 'POST', headers: auth,
      body: JSON.stringify({ action: 'start', revision: 3, now: '2029-12-31T10:00:00.000Z' }),
    });
    assert.equal(tooEarly.status, 422);
    const tooEarlyBody = await bodyOf(tooEarly);
    assert.match(tooEarlyBody.error, /too early/);
    assert.equal(tooEarlyBody.ok, false);

    // El servidor debe negar activación si no hay un destinatario compatible.
    const noRecipients = await json(server.base, stateUrl, {
      method: 'POST', headers: auth,
      body: JSON.stringify({ action: 'start', revision: 3, now: '2030-01-01T10:00:00.000Z' }),
    });
    assert(noRecipients.status >= 400 && noRecipients.status < 500, `se esperaba rechazo 4xx, recibido ${noRecipients.status}`);
    assert.match((await bodyOf(noRecipients)).error, /asigna al menos un alumno elegible/i);
    const stillScheduled = await bodyOf(await json(server.base, testUrl, { headers: auth }));
    assert.equal(stillScheduled.test.status, 'scheduled');
    assert.equal(stillScheduled.test.revision, 2);

    // Guardar alumno y grupo válidos antes de activar; el grupo se expande usando
    // la membresía persistida y las identidades/grados cargados del almacenamiento.
    const validAssignments = await json(server.base, assignmentsUrl, {
      method: 'PUT', headers: auth,
      body: JSON.stringify({ assignments: [
        { targetType: 'student', accountPlayerId: student },
        { targetType: 'group', groupId, expandGroup: true },
      ] }),
    });
    assert.equal(validAssignments.status, 200);
    const validAssignmentsBody = await bodyOf(validAssignments);
    assert.equal(validAssignmentsBody.assignments.length, 3);
    assert(validAssignmentsBody.assignments.some(item => item.targetType === 'group' && item.groupId === groupId));
    assert(validAssignmentsBody.assignments.some(item => item.accountPlayerId === student));
    assert(validAssignmentsBody.assignments.some(item => item.accountPlayerId === groupStudent && item.sourceGroupId === groupId));

    const incompatible = await json(server.base, assignmentsUrl, {
      method: 'PUT', headers: auth,
      body: JSON.stringify({ assignments: [{ targetType: 'student', accountPlayerId: incompatibleStudent }] }),
    });
    assert.equal(incompatible.status, 422);
    assert.match((await bodyOf(incompatible)).error, /incompatibles con el grado/i);

    const duplicate = await json(server.base, assignmentsUrl, {
      method: 'PUT', headers: auth,
      body: JSON.stringify({ assignments: [
        { targetType: 'student', accountPlayerId: student },
        { targetType: 'student', accountPlayerId: student },
      ] }),
    });
    assert.equal(duplicate.status, 422);
    const invalidStudent = await json(server.base, assignmentsUrl, {
      method: 'PUT', headers: auth,
      body: JSON.stringify({ assignments: [{ targetType: 'student', accountPlayerId: 'not-an-id' }] }),
    });
    assert.equal(invalidStudent.status, 422);
    const invalidGroup = await json(server.base, assignmentsUrl, {
      method: 'PUT', headers: auth,
      body: JSON.stringify({ assignments: [{ targetType: 'group', groupId: '' }] }),
    });
    assert.equal(invalidGroup.status, 422);

    // Los rechazos directos no deben reemplazar asignaciones válidas.
    const assignments = await bodyOf(await json(server.base, assignmentsUrl, { headers: auth }));
    assert.equal(assignments.assignments.length, 3);
    assert(!/password|token|cookie|session/i.test(JSON.stringify(assignments)));

    const active = await json(server.base, stateUrl, {
      method: 'POST', headers: auth,
      body: JSON.stringify({ action: 'start', revision: 3, now: '2030-01-01T10:00:00.000Z' }),
    });
    assert.equal(active.status, 200);
    assert.equal((await bodyOf(active)).test.status, 'active');

    await stop(server.child);
    server = null;
    port += 1;
    server = await start(dir, port);
    const recoveredAssignments = await bodyOf(await json(server.base, assignmentsUrl, { headers: auth }));
    assert.equal(recoveredAssignments.assignments.length, 3);
    const recoveredTest = await bodyOf(await json(server.base, testUrl, { headers: auth }));
    assert.equal(recoveredTest.test.status, 'active');
    assert.equal(recoveredTest.test.configuration.grade, '5° Primaria');

    console.log('OK: programación y asignaciones usan persistencia temporal aislada; verifican elegibilidad por grado registrado, rechazo de activación sin alumnos compatibles, alumno/grupo, duplicados, validación, persistencia y recuperación.');
  } finally {
    await stop(server?.child);
    fs.rmSync(dir, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exit(1); });
