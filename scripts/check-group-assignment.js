'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { randomUUID } = require('crypto');
const { createGroupStore } = require('../src/server/groups/groupStore');
const { createGroupService } = require('../src/server/groups/groupService');
const { createTestStore } = require('../src/server/exams/testStore');
const { createTestService } = require('../src/server/exams/testService');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'math-attack-group-assignment-'));
const ids = { one: randomUUID(), two: randomUUID() };
try {
  const groupStore = createGroupStore({ baseDir: dir });
  const groupService = createGroupService({ store: groupStore, resolveAccountPlayer: id => [ids.one, ids.two].includes(id) });
  const group = groupService.create({ actor: 'admin', eventId: randomUUID(), name: 'Grupo 5A', grade: '5', schoolYear: '2030' }).group;
  groupService.addMember({ actor: 'admin', eventId: randomUUID(), groupId: group.groupId, accountPlayerId: ids.one, revision: 2 });
  groupService.addMember({ actor: 'admin', eventId: randomUUID(), groupId: group.groupId, accountPlayerId: ids.two, revision: 3 });

  const testStore = createTestStore({ baseDir: dir, fileName: 'pruebas.json' });
  const service = createTestService({ store: testStore, groupResolver: groupId => groupService.members(groupId) });
  const draft = service.create({ title: 'Prueba de grupo', creator: randomUUID() });
  const assignments = service.replaceAssignments(draft.testId, [{ targetType: 'group', groupId: group.groupId, expandGroup: true }]);
  assert.equal(assignments.length, 3);
  assert.equal(assignments.filter(item => item.targetType === 'group').length, 1);
  assert.equal(assignments.filter(item => item.targetType === 'student').length, 2);
  assert(assignments.filter(item => item.targetType === 'student').every(item => item.sourceGroupId === group.groupId));
  assert.deepEqual(new Set(assignments.filter(item => item.targetType === 'student').map(item => item.accountPlayerId)), new Set([ids.one, ids.two]));
  assert.equal(service.listAssignments(draft.testId).length, 3);
  const repeated = service.replaceAssignments(draft.testId, [{ targetType: 'group', groupId: group.groupId, expandGroup: true }, ...assignments.filter(item => item.targetType === 'student')]);
  assert.equal(repeated.length, 3);

  const reopened = createTestStore({ baseDir: dir, fileName: 'pruebas.json' });
  const recovered = createTestService({ store: reopened, groupResolver: groupId => groupService.members(groupId) });
  assert.equal(recovered.listAssignments(draft.testId).length, 3);
  assert(recovered.listAssignments(draft.testId).every(item => item.groupId === group.groupId));

  const cancelled = recovered.create({ title: 'Cancelada', creator: randomUUID() });
  recovered.cancel(cancelled.testId, cancelled.revision + 1);
  assert.throws(() => recovered.replaceAssignments(cancelled.testId, [{ targetType: 'group', groupId: group.groupId, expandGroup: true }]), /no asignable|cancelada|finalizada|estado/i);
  const finished = recovered.create({ title: 'Finalizada', creator: randomUUID() });
  const finishedScheduled = recovered.schedule(finished.testId, finished.revision + 1, { startsAt: '2030-01-01T10:00:00.000Z' });
  const finishedActive = recovered.start(finished.testId, finishedScheduled.revision + 1, { now: '2030-01-01T10:00:00.000Z' });
  const finishedClosed = recovered.close(finished.testId, finishedActive.revision + 1);
  recovered.finish(finished.testId, finishedClosed.revision + 1);
  assert.throws(() => recovered.replaceAssignments(finished.testId, [{ targetType: 'group', groupId: group.groupId, expandGroup: true }]), /no asignable|cancelada|finalizada|estado/i);
  const closed = recovered.create({ title: 'Cerrada', creator: randomUUID() });
  const closedScheduled = recovered.schedule(closed.testId, closed.revision + 1, { startsAt: '2030-01-01T10:00:00.000Z' });
  const closedActive = recovered.start(closed.testId, closedScheduled.revision + 1, { now: '2030-01-01T10:00:00.000Z' });
  recovered.close(closed.testId, closedActive.revision + 1);
  assert.throws(() => recovered.replaceAssignments(closed.testId, [{ targetType: 'group', groupId: group.groupId, expandGroup: true }]), /no asignable|cerrada|estado/i);
  assert(!JSON.stringify(reopened.load()).match(/password|pwd|token|cookie|session/i));
  console.log('OK: asignación por grupo expande accountPlayerId, conserva groupId, persiste y rechaza estados terminales.');
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
