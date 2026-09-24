'use strict';

const assert = require('assert');
const { createRoot } = require('../src/server/exams/testModel');
const { createTestService } = require('../src/server/exams/testService');

const creator = '11111111-1111-4111-8111-111111111111';
const student = '22222222-2222-4222-8222-222222222222';
const testId = '33333333-3333-4333-8333-333333333333';
const root = createRoot();
const store = { load: () => root, save: value => Object.assign(root, value) };
const service = createTestService({ store });

const test = service.create({ testId, creator, configuration: {
  version: 1, multiplier: 1, total: 5,
  opsConfig: { mult: { tables: [2], qty: 5, ranges: [{ table: 2, from: 2, to: 4 }], repeat: true, manner: 'ordered' } },
} });
service.replaceAssignments(test.testId, [{ targetType: 'student', accountPlayerId: student }]);
service.start(test.testId, 2, { force: true });
const startedAt = Date.now();
service.recordLiveExamProgress({ testId, accountPlayerId: student, studentSnapshot: { name: 'Alumno', grade: '5A' }, message: {
  examStartedAt: startedAt, totalQ: 5, qIndex: 2, correct: 1, wrong: 1, timeout: 0, score: 10,
} });

const finished = service.finishActiveExamAttempts(testId, { reason: 'exam_stopped' });
assert.strictEqual(finished.length, 1);
assert.strictEqual(finished[0].attempt.status, 'finished');
assert.strictEqual(finished[0].result.complete, true);
assert.strictEqual(finished[0].result.correct, 1);
assert.strictEqual(finished[0].result.incorrect, 1);
assert.strictEqual(finished[0].result.timeout, 3);
assert.strictEqual(finished[0].result.total, 5);
assert.strictEqual(finished[0].attempt.progress.answers.filter(answer => answer.timeout === true).length, 3);
assert.strictEqual(service.finishActiveExamAttempts(testId).length, 0, 'la segunda detencion debe ser idempotente');

console.log('OK detencion inmediata: respuestas conservadas, preguntas restantes sin tiempo, resultado final e idempotencia.');
