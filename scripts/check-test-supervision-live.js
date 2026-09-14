'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createTestStore } = require('../src/server/exams/testStore');
const { createRoot, createTest, createAttempt, createCheckpoint } = require('../src/server/exams/testModel');
const { createTestSupervisionService } = require('../src/server/exams/testSupervisionService');
const { createAttemptActionService } = require('../src/server/exams/attemptActionService');

const ids = { test: '11111111-1111-4111-8111-111111111111', student: '22222222-2222-4222-8222-222222222222', creator: '33333333-3333-4333-8333-333333333333' };
const event = n => `44444444-4444-4444-8444-${String(n).padStart(12, '0')}`;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'math-attack-supervision-live-'));
try {
  const store = createTestStore({ baseDir: dir });
  const root = createRoot();
  root.tests.push(createTest({ testId: ids.test, title: 'Supervisión viva', creator: ids.creator, status: 'active', configuration: { version: 1, total: 4, opsConfig: { mult: { tables: [3], ranges: [{ table: 3, from: 2, to: 3 }] }, add: { digits: 2, carryMode: 'both' } } } }));
  store.save(root);
  const supervision = createTestSupervisionService({ store });
  const actions = createAttemptActionService({ store, persist: data => store.save(data) });
  const attempt = createAttempt({ testId: ids.test, accountPlayerId: ids.student, status: 'in_progress', progress: { studentSnapshot: { name: 'Alumno seguro', grade: '5A', pin: 'NO-DEBE-SALIR' }, currentIndex: 2, totalQuestions: 4, correct: 1, incorrect: 1 } });
  const afterRestart = store.load(); afterRestart.attempts.push(attempt); afterRestart.checkpoints.push(createCheckpoint({ attemptId: attempt.attemptId, index: 2, revision: 1, correct: 1, incorrect: 1, effectiveTime: 12 })); store.save(afterRestart);
  const live = supervision.getTestAttempt(ids.test, attempt.attemptId);
  assert.equal(live.accountPlayerId, ids.student); assert.equal(live.testId, ids.test); assert.equal(live.attemptId, attempt.attemptId);
  assert.equal(live.progress.currentIndex, undefined); assert.equal(live.index, 2); assert.equal(live.correct, 1); assert.equal(live.incorrect, 1); assert.equal(live.checkpointRestored, true); assert.equal(live.connectionState, 'connected');
  assert.equal(JSON.stringify(live).includes('NO-DEBE-SALIR'), false); assert.equal(JSON.stringify(live).includes('answers'), false);
  const pause = actions.pauseAttempt({ testId: ids.test, attemptId: attempt.attemptId, actor: 'admin', revision: attempt.revision + 1, eventId: event(1), reason: 'pausa de supervision' }); assert.equal(pause.attempt.status, 'paused');
  const duplicate = actions.pauseAttempt({ testId: ids.test, attemptId: attempt.attemptId, actor: 'admin', revision: 999, eventId: event(1), reason: 'pausa de supervision' }); assert.equal(duplicate.duplicate, true);
  const recovered = supervision.getTestAttempt(ids.test, attempt.attemptId); assert.equal(recovered.status, 'paused'); assert.equal(recovered.accountPlayerId, ids.student);
  assert.throws(() => actions.resumeAttempt({ testId: ids.test, attemptId: attempt.attemptId, actor: 'admin', revision: recovered.revision, eventId: event(2), reason: 'revision invalida' }), /revision antigua/);
  console.log('OK supervisión viva: store actualizado, metadatos seguros, checkpoint, acción auditable e idempotencia');
} finally { fs.rmSync(dir, { recursive: true, force: true }); }
