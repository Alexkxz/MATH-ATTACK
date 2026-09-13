'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createGroupStore } = require('../src/server/groups/groupStore');
const { createGroupService } = require('../src/server/groups/groupService');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'math-attack-groups-'));
const ids = { group: '11111111-1111-4111-8111-111111111111', student: '22222222-2222-4222-8222-222222222222' };
const event = n => `33333333-3333-4333-8333-${String(n).padStart(12, '0')}`;
try {
  const store = createGroupStore({ baseDir: dir });
  const service = createGroupService({ store, resolveAccountPlayer: id => id === ids.student });
  const created = service.create({ actor: 'admin', eventId: event(1), name: '5A', grade: '5', schoolYear: '2030' });
  assert.equal(created.duplicate, false); assert(created.group.groupId); assert.equal(created.group.memberAccountPlayerIds.length, 0);
  const repeated = service.create({ actor: 'admin', eventId: event(1), name: '5A', grade: '5', schoolYear: '2030' });
  assert.equal(repeated.duplicate, true); assert.equal(repeated.group.groupId, created.group.groupId);
  assert.throws(() => service.create({ actor: 'admin', eventId: event(1), name: 'otro', grade: '6', schoolYear: '2030' }), /eventId contradictorio/);
  assert.throws(() => service.create({ actor: 'admin', eventId: event(2), name: '5A', grade: '5', schoolYear: '2030' }), /grupo duplicado/);
  const added = service.addMember({ actor: 'admin', eventId: event(3), groupId: created.group.groupId, accountPlayerId: ids.student, revision: 2 });
  assert.equal(added.group.memberAccountPlayerIds[0], ids.student);
  assert.throws(() => service.addMember({ actor: 'admin', eventId: event(4), groupId: created.group.groupId, accountPlayerId: ids.student, revision: 3 }), /ya pertenece/);
  const reopened = createGroupStore({ baseDir: dir });
  assert.deepEqual(reopened.load().groups[0].memberAccountPlayerIds, [ids.student]);
  const removed = createGroupService({ store: reopened, resolveAccountPlayer: id => id === ids.student }).removeMember({ actor: 'admin', eventId: event(5), groupId: created.group.groupId, accountPlayerId: ids.student, revision: 3 });
  assert.deepEqual(removed.group.memberAccountPlayerIds, []);
  const reopenedService = createGroupService({ store: reopened, resolveAccountPlayer: id => id === ids.student });
  const repeatedRemoval = reopenedService.removeMember({ actor: 'admin', eventId: event(5), groupId: created.group.groupId, accountPlayerId: ids.student, revision: 3 });
  assert.equal(repeatedRemoval.duplicate, true);
  const root = reopened.load();
  const memberEvents = root.events.filter(item => item.accountPlayerId === ids.student);
  assert.equal(memberEvents.length, 2);
  assert.deepEqual(memberEvents.map(item => item.operation), ['group_member_added', 'group_member_removed']);
  assert(memberEvents.every(item => item.groupId === created.group.groupId && item.accountPlayerId === ids.student && item.actor === 'admin' && item.fingerprint));
  assert(memberEvents[1].revision > memberEvents[0].revision);
  assert.throws(() => reopenedService.removeMember({ actor: 'admin', eventId: event(5), groupId: created.group.groupId, accountPlayerId: '33333333-3333-4333-8333-333333333333', revision: 4 }), /eventId contradictorio/);
  assert(!JSON.stringify(root).match(/password|pwd|token|cookie|session/i));
  console.log('OK: grupos versionados, persistencia atomica, miembros por accountPlayerId, auditoria, revisiones e idempotencia.');
} finally { fs.rmSync(dir, { recursive: true, force: true }); }
