'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createTestStore } = require('../src/server/exams/testStore');
const { createTestService } = require('../src/server/exams/testService');

const creator = '11111111-1111-4111-8111-111111111111';
const student = '22222222-2222-4222-8222-222222222222';
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'math-attack-assignment-'));
try {
  let store = createTestStore({ baseDir: dir });
  let service = createTestService({ store });
  const test = service.create({ title: 'Asignaciones', creator });
  const assignments = service.replaceAssignments(test.testId, [{ targetType: 'student', accountPlayerId: student }, { targetType: 'group', groupId: 'grupo-5' }]);
  assert.equal(assignments.length, 2);
  assert.equal(service.listAssignments(test.testId).length, 2);
  assert.throws(() => service.replaceAssignments(test.testId, [{ targetType: 'student', accountPlayerId: student }, { targetType: 'student', accountPlayerId: student }]), /duplicada/);
  assert.throws(() => service.replaceAssignments(test.testId, [{ targetType: 'student', accountPlayerId: 'no-es-id' }]), /UUID|invalida/);
  assert.throws(() => service.replaceAssignments(test.testId, [{ targetType: 'group', groupId: '' }]), /inválida/);
  store = createTestStore({ baseDir: dir }); service = createTestService({ store });
  assert.deepEqual(service.listAssignments(test.testId).map(item => item.accountPlayerId || item.groupId).sort(), [student, 'grupo-5'].sort());
  console.log('OK: asignación individual y por grupo, duplicados, datos inválidos, persistencia e identidad estable.');
} finally { fs.rmSync(dir, { recursive: true, force: true }); }
