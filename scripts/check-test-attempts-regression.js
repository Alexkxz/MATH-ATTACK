'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createTestStore } = require('../src/server/exams/testStore');
const { createTestService } = require('../src/server/exams/testService');
const { buildLegacyIdentityMap, resolveAccountPlayerId } = require('../src/server/exams/legacyIdentityAdapter');

const uuid = {
  creator: '11111111-1111-4111-8111-111111111111',
  a: '22222222-2222-4222-8222-222222222222',
  b: '33333333-3333-4333-8333-333333333333',
};
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'math-attack-attempt-regression-'));
try {
  const store = createTestStore({ baseDir: dir });
  const service = createTestService({ store });
  const active = service.create({ title: 'Activa ficticia', creator: uuid.creator });
  service.start(active.testId, 2, { force: true });
  service.replaceAssignments(active.testId, [{ targetType: 'group', groupId: '3' }]);
  const attempt = service.createStudentAttempt({ testId: active.testId, accountPlayerId: uuid.a, groupId: '3', studentSnapshot: { name: 'Alumno ficticio', grade: '3' } });
  assert.equal(attempt.testId, active.testId);
  assert.equal(attempt.accountPlayerId, uuid.a);
  assert.throws(() => service.createStudentAttempt({ testId: active.testId, accountPlayerId: uuid.b, groupId: '4' }), /no asignado/);

  const duplicate = service.createStudentAttempt({ testId: active.testId, accountPlayerId: uuid.a, groupId: '3' });
  assert.equal(duplicate.attemptId, attempt.attemptId, 'reintentar el inicio debe devolver el mismo intento abierto');
  assert.equal(service.listAttempts(active.testId, { accountPlayerId: uuid.a }).length, 1, 'el reintento no debe duplicar intentos');
  assert.throws(() => service.startStudentAttempt(attempt.attemptId, uuid.b), /no encontrado/);
  assert.equal(service.startStudentAttempt(attempt.attemptId, uuid.a, '3').status, 'in_progress');
  assert.equal(service.startStudentAttempt(attempt.attemptId, uuid.a, '3').status, 'in_progress');
  assert.equal(service.listAttempts(active.testId, { accountPlayerId: uuid.a }).length, 1, 'continuar no consume otro intento');

  const draft = service.create({ title: 'Borrador ficticio', creator: uuid.creator });
  service.replaceAssignments(draft.testId, [{ targetType: 'student', accountPlayerId: uuid.a }]);
  assert.throws(() => service.createStudentAttempt({ testId: draft.testId, accountPlayerId: uuid.a, groupId: '3' }), /no activa|no disponible/);
  const scheduled = service.create({ title: 'Programada ficticia', creator: uuid.creator });
  service.replaceAssignments(scheduled.testId, [{ targetType: 'student', accountPlayerId: uuid.a }]);
  service.schedule(scheduled.testId, 2, { startsAt: '2030-01-01T00:00:00.000Z' });
  assert.throws(() => service.createStudentAttempt({ testId: scheduled.testId, accountPlayerId: uuid.a, groupId: '3' }), /no activa|no disponible/);
  const cancelled = service.create({ title: 'Cancelada ficticia', creator: uuid.creator });
  service.replaceAssignments(cancelled.testId, [{ targetType: 'student', accountPlayerId: uuid.a }]);
  service.schedule(cancelled.testId, 2, { startsAt: '2030-01-01T00:00:00.000Z' });
  service.cancel(cancelled.testId, 3);
  assert.throws(() => service.createStudentAttempt({ testId: cancelled.testId, accountPlayerId: uuid.a, groupId: '3' }), /no activa|no disponible/);

  const reopened = createTestService({ store: createTestStore({ baseDir: dir }) });
  assert.equal(reopened.listAttempts(active.testId).length, 1, 'el intento debe sobrevivir al reinicio del store');
  const legacyPlayers = [{ id: 'OLD-A', name: 'Alumno legado ficticio', grade: '3' }];
  const legacy = resolveAccountPlayerId(legacyPlayers[0], buildLegacyIdentityMap(legacyPlayers));
  assert.equal(legacy, resolveAccountPlayerId(legacyPlayers[0], buildLegacyIdentityMap(legacyPlayers)));
  const fixturePath = path.join(dir, 'players.json');
  fs.writeFileSync(fixturePath, JSON.stringify(legacyPlayers), 'utf8');
  const before = crypto.createHash('sha256').update(fs.readFileSync(fixturePath)).digest('hex');
  JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
  assert.equal(before, crypto.createHash('sha256').update(fs.readFileSync(fixturePath)).digest('hex'));
  console.log('OK: intentos, asignaciones, idempotencia, estados y reinicio con fixtures temporales.');
} finally {
  const relative = path.relative(path.resolve(os.tmpdir()), path.resolve(dir));
  assert(relative && !relative.startsWith('..') && !path.isAbsolute(relative), `unsafe temporary fixture cleanup path: ${dir}`);
  fs.rmSync(dir, { recursive: true, force: true });
}
