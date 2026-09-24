'use strict';

const assert = require('assert');
const { createRoot, createTest, createAssignment } = require('../src/server/exams/testModel');
const { createTestService } = require('../src/server/exams/testService');

const testId = '11111111-1111-4111-8111-111111111111';
const accountPlayerId = '22222222-2222-4222-8222-222222222222';
let root = createRoot();
const store = { load: () => root, save: next => { root = next; } };
const service = createTestService({ store });
const test = createTest({ testId, title: 'Progreso en vivo', creator: '33333333-3333-4333-8333-333333333333', status: 'active' });
root.tests.push(test);
root.assignments.push(createAssignment({ testId, targetType: 'student', accountPlayerId }));
const startedAt = Date.now();

const first = service.recordLiveExamProgress({ testId, accountPlayerId, studentSnapshot: { name: 'Adrian', grade: '4°' }, message: { examStartedAt: startedAt, qIndex: 3, totalQ: 10, correct: 2, wrong: 1, score: 20 } });
assert.equal(root.attempts.length, 1);
assert.equal(first.attempt.status, 'in_progress');
assert.equal(first.attempt.progress.currentIndex, 3);

const second = service.recordLiveExamProgress({ testId, accountPlayerId, studentSnapshot: { name: 'Adrian', grade: '4°' }, message: { examStartedAt: startedAt, qIndex: 6, totalQ: 10, correct: 4, wrong: 2, score: 40 } });
assert.equal(second.attempt.attemptId, first.attempt.attemptId);
assert.equal(root.attempts.length, 1);
assert.equal(second.attempt.progress.currentIndex, 6);

const finished = service.recordLiveExamResult({ testId, accountPlayerId, studentSnapshot: { name: 'Adrian', grade: '4°' }, message: { examStartedAt: startedAt, total: 10, correct: 7, wrong: 3, score: 70, durationMs: 12000 } });
assert.equal(finished.attempt.attemptId, first.attempt.attemptId);
assert.equal(finished.attempt.status, 'finished');
assert.equal(root.attempts.length, 1);
assert.equal(root.results.length, 1);
assert.equal(root.results[0].correct, 7);
assert.equal(service.recordLiveExamResult({ testId, accountPlayerId, message: { examStartedAt: startedAt, total: 10, correct: 7, wrong: 3, score: 70 } }).duplicate, true);
console.log('OK: el progreso live conserva el mismo intento, folio, alumno y resultado final sin duplicados.');
