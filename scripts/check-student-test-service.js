'use strict';

const assert = require('assert');
const { createRoot, createTest, createAssignment } = require('../src/server/exams/testModel');
const { createTestService } = require('../src/server/exams/testService');

const ids = {
  test: '11111111-1111-4111-8111-111111111111',
  creator: '66666666-6666-4666-8666-666666666666',
  student: '22222222-2222-4222-8222-222222222222',
  event: '33333333-3333-4333-8333-333333333333',
  event2: '44444444-4444-4444-8444-444444444444',
  event3: '55555555-5555-4555-8555-555555555555'
};
const root = createRoot();
const test = createTest({ testId: ids.test, creator: ids.creator, status: 'active', title: 'Flujo alumno', configuration: {
  version: 1,
  multiplier: 5,
  total: 2,
  opsConfig: { mult: { tables: [2], ranges: [{ table: 2, from: 3, to: 4 }], manner: 'ordered' } }
}});
root.tests.push(test);
root.assignments.push(createAssignment({ testId: ids.test, targetType: 'student', accountPlayerId: ids.student }));
let saves = 0;
const service = createTestService({ store: { load: () => root, save: () => { saves += 1; } } });

const attempt = service.createStudentAttempt({ testId: ids.test, accountPlayerId: ids.student, studentSnapshot: { name: 'Alumno' } });
assert.strictEqual(attempt.status, 'pending');
assert.strictEqual(attempt.progress.questions.length, 2);
assert.strictEqual(attempt.configurationSnapshot.multiplier, 5);
test.configuration.multiplier = 1;
assert.strictEqual(attempt.configurationSnapshot.multiplier, 5);
service.startStudentAttempt(attempt.attemptId, ids.student);

const first = attempt.progress.questions[0];
const answer = service.answerStudentQuestion({ testId: ids.test, attemptId: attempt.attemptId, accountPlayerId: ids.student, questionId: first.questionId, answer: first.answer, eventId: ids.event });
assert.strictEqual(answer.correct, true);
assert.strictEqual(answer.attempt.progress.score, 5);
assert.strictEqual(service.answerStudentQuestion({ testId: ids.test, attemptId: attempt.attemptId, accountPlayerId: ids.student, questionId: first.questionId, answer: first.answer, eventId: ids.event }).duplicate, true);
assert.throws(() => service.answerStudentQuestion({ testId: ids.test, attemptId: attempt.attemptId, accountPlayerId: ids.student, questionId: first.questionId, answer: 0, eventId: ids.event }), /eventId contradictorio/);

service.disconnectStudentAttempt({ testId: ids.test, attemptId: attempt.attemptId, accountPlayerId: ids.student });
assert.strictEqual(attempt.status, 'disconnected');
service.reconnectStudentAttempt({ testId: ids.test, attemptId: attempt.attemptId, accountPlayerId: ids.student });
assert.strictEqual(attempt.status, 'in_progress');
const second = attempt.progress.questions[1];
service.answerStudentQuestion({ testId: ids.test, attemptId: attempt.attemptId, accountPlayerId: ids.student, questionId: second.questionId, answer: 0, eventId: ids.event2 });
const finished = service.finishStudentAttempt({ testId: ids.test, attemptId: attempt.attemptId, accountPlayerId: ids.student, eventId: ids.event3 });
assert.strictEqual(finished.result.complete, true);
assert.strictEqual(finished.result.total, 2);
assert.strictEqual(finished.result.score, 5);
assert.strictEqual(service.finishStudentAttempt({ testId: ids.test, attemptId: attempt.attemptId, accountPlayerId: ids.student, eventId: ids.event3 }).duplicate, true);
assert.strictEqual(root.results.length, 1);
assert(saves > 0);

console.log('OK servicio del flujo del alumno: asignacion, intento, respuestas, reconexion, finalizacion e idempotencia');
