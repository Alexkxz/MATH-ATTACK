'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createTestStore } = require('../src/server/exams/testStore');
const { createTestService } = require('../src/server/exams/testService');
const { createTestLibraryService } = require('../src/server/exams/testLibraryService');

const creator = '11111111-1111-4111-8111-111111111111';
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'math-attack-flow-'));
try {
  let store = createTestStore({ baseDir: dir });
  let service = createTestService({ store });
  const test = service.create({ title: 'Recorrido completo', creator });
  assert.equal(test.status, 'draft');
  assert.equal(service.schedule(test.testId, 2, { startsAt: '2030-01-01T10:00:00.000Z' }).status, 'scheduled');
  assert.throws(() => service.start(test.testId, 3, { now: '2029-12-31T10:00:00.000Z' }), /too early/);
  assert.equal(service.start(test.testId, 3, { now: '2030-01-01T10:00:00.000Z' }).status, 'active');
  assert.equal(service.pause(test.testId, 4).status, 'paused');
  assert.equal(service.resume(test.testId, 5).status, 'active');
  assert.equal(service.close(test.testId, 6).status, 'closed');
  assert.equal(service.finish(test.testId, 7).status, 'finished');
  assert.throws(() => service.resume(test.testId, 8), /Transici/);
  const cancelled = service.create({ title: 'Cancelada', creator });
  assert.equal(service.cancel(cancelled.testId, 2).status, 'cancelled');
  assert.throws(() => service.start(cancelled.testId, 3, { force: true }), /Transici/);
  const eventsBeforeRestart = store.load().events.filter(event => event.testId === test.testId);
  assert.deepEqual(eventsBeforeRestart.map(event => event.action), ['test_created', 'test_scheduled', 'test_started', 'test_paused', 'test_resumed', 'test_closed', 'test_finished']);
  store = createTestStore({ baseDir: dir });
  service = createTestService({ store });
  assert.equal(service.get(test.testId).status, 'finished');
  const library = createTestLibraryService({ loadRoot: () => store.load() });
  const row = library.list({ status: 'finished' }).find(item => item.testId === test.testId);
  assert(row);
  assert.equal(row.attemptCount, 0);
  assert.equal(library.list({ status: 'cancelled' }).some(item => item.testId === cancelled.testId), true);
  console.log('OK: recorrido draft→scheduled→active→paused→active→closed→finished, cancelación, rechazo, auditoría, persistencia y biblioteca.');
} finally { fs.rmSync(dir, { recursive: true, force: true }); }
