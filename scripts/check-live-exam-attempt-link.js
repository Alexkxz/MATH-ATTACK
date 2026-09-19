'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createTestStore } = require('../src/server/exams/testStore');
const { createTestService } = require('../src/server/exams/testService');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'math-attack-live-link-'));
try {
  const store = createTestStore({ baseDir: dir });
  store.initialize();
  const service = createTestService({ store });
  const testId = '11111111-1111-4111-8111-111111111111';
  const accountPlayerId = '22222222-2222-4222-8222-222222222222';
  service.create({ testId, creator: '33333333-3333-4333-8333-333333333333', configuration: { total: 3 } });
  const message = { examStartedAt: Date.now() - 12000, total: 3, correct: 2, wrong: 1, score: 20, durationMs: 12000 };
  const first = service.recordLiveExamResult({ testId, accountPlayerId, studentSnapshot: { name: 'Ana', grade: '6A' }, message });
  assert.equal(first.duplicate, false);
  assert.equal(first.attempt.origin, 'live_exam');
  assert.equal(first.attempt.status, 'finished');
  assert.equal(first.attempt.testId, testId);
  assert.equal(first.result.total, 3);
  assert.equal(service.listAttempts(testId).length, 1);
  const repeated = service.recordLiveExamResult({ testId, accountPlayerId, studentSnapshot: { name: 'Ana', grade: '6A' }, message });
  assert.equal(repeated.duplicate, true);
  assert.equal(service.listAttempts(testId).length, 1);
  console.log('OK enlace modo examen en vivo: testId, intento terminado, resultado e idempotencia.');
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
