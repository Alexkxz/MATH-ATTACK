'use strict';

// Directed service regression for PRUEBAS.7. Every scenario uses its own
// temporary persistence directory and a deterministic clock.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createTestStore } = require('../src/server/exams/testStore');
const { createTestService } = require('../src/server/exams/testService');
const { createTest, createAssignment, createAttempt, createResult } = require('../src/server/exams/testModel');
const { createTestLibraryService } = require('../src/server/exams/testLibraryService');

const id = () => crypto.randomUUID();
const START = '2030-01-15T16:00:00.000Z';
const CLOSE = '2030-01-15T17:00:00.000Z';
const configuration = { grade: '5', op: 'mult', tables: [2], total: 2, answerMode: 'write', allowedAttempts: 1 };

function sandbox(name) {
  const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), `math-attack-pruebas7-${name}-`));
  let now = Date.parse('2030-01-15T15:00:00.000Z');
  const store = createTestStore({ baseDir, logger: { error() {} } });
  const service = createTestService({ store, clock: () => new Date(now) });
  return {
    baseDir, store, service,
    setNow(value) { now = Date.parse(value); },
    dispose() { fs.rmSync(baseDir, { recursive: true, force: true }); },
  };
}

function createAssigned(service, accountPlayerId, title = 'Prueba ficticia') {
  const test = service.create({ title, creator: id(), configuration });
  service.replaceAssignments(test.testId, [{ targetType: 'student', accountPlayerId }]);
  return service.get(test.testId);
}

function checkScheduleAndExistingAttempt() {
  const box = sandbox('window');
  try {
    const activeStudent = id(), pendingStudent = id();
    const test = box.service.create({ title: 'Ventana programada', creator: id(), configuration });
    box.service.replaceAssignments(test.testId, [
      { targetType: 'student', accountPlayerId: activeStudent },
      { targetType: 'student', accountPlayerId: pendingStudent },
    ]);
    box.service.schedule(test.testId, test.revision + 1, { startsAt: START, closesAt: CLOSE });

    box.setNow('2030-01-15T15:59:59.999Z');
    box.service.evaluateAvailability('2030-01-15T15:59:59.999Z');
    assert.equal(box.service.get(test.testId).status, 'scheduled', 'remains scheduled until the exact opening instant');
    assert.throws(() => box.service.createStudentAttempt({ testId: test.testId, accountPlayerId: activeStudent }), /no disponible|cerrad|programad/i);
    assert.equal(box.service.studentCanAccess(test.testId, activeStudent), false);

    box.setNow(START);
    const opened = box.service.evaluateAvailability(START);
    assert.equal(box.service.get(test.testId).status, 'active', 'opens at the exact start instant');
    assert.equal(opened.changed.filter(row => row.testId === test.testId).length, 1);
    const startEvents = box.store.load().events.filter(row => row.testId === test.testId && row.action === 'test_started').length;
    box.service.evaluateAvailability(START);
    assert.equal(box.store.load().events.filter(row => row.testId === test.testId && row.action === 'test_started').length, startEvents, 'repeated planner evaluation does not duplicate transitions');

    const inProgress = box.service.createStudentAttempt({ testId: test.testId, accountPlayerId: activeStudent, studentSnapshot: { name: 'Alumna ficticia A', grade: '5' } });
    box.service.startStudentAttempt(inProgress.attemptId, activeStudent, undefined, test.testId);
    inProgress.progress.timeLeft = 55;
    inProgress.progress.globalRemainingMs = 55000;
    inProgress.progress.timeSavedAt = START;
    const pending = box.service.createStudentAttempt({ testId: test.testId, accountPlayerId: pendingStudent, studentSnapshot: { name: 'Alumno ficticio B', grade: '5' } });
    assert.equal(pending.status, 'pending');

    box.setNow(CLOSE);
    const closed = box.service.evaluateAvailability(CLOSE);
    assert.equal(box.service.get(test.testId).status, 'closed', 'closes new participation at the exact close instant');
    assert.equal(closed.changed.filter(row => row.testId === test.testId).length, 1);
    assert.equal(box.service.studentCanAccess(test.testId, activeStudent), true, 'the already-started attempt remains recoverable');
    assert.equal(box.service.studentCanAccess(test.testId, pendingStudent), false, 'pending attempt does not grant late entry');
    assert.throws(() => box.service.createStudentAttempt({ testId: test.testId, accountPlayerId: pendingStudent }), /no disponible|cerrad/i);
    assert.throws(() => box.service.startStudentAttempt(pending.attemptId, pendingStudent, undefined, test.testId), /no disponible|cerrad|iniciar/i);

    const priorQuestions = JSON.stringify(inProgress.progress.questions);
    // Simulate abrupt restart: service recovery marks started work disconnected;
    // the durable attempt and its question snapshot must survive unchanged.
    box.store.flushSync();
    const restartedStore = createTestStore({ baseDir: box.baseDir, logger: { error() {} } });
    const restarted = createTestService({ store: restartedStore, clock: () => new Date(CLOSE) });
    const restartCount = restarted.recoverAfterRestart({ now: Date.parse(CLOSE) });
    assert.equal(restartCount, 1);
    const afterRestart = restarted.getStudentAttempt(test.testId, inProgress.attemptId, activeStudent);
    assert.equal(afterRestart.status, 'disconnected');
    assert.equal(JSON.stringify(afterRestart.progress.questions), priorQuestions);
    const continued = restarted.startStudentAttempt(inProgress.attemptId, activeStudent, undefined, test.testId);
    assert.equal(continued.status, 'in_progress', 'started attempt can resume after close/restart');
    assert.equal(continued.progress.timeLeft, 55, 'recovery keeps the saved question clock');
    assert.equal(continued.progress.globalRemainingMs, 55000, 'recovery keeps the saved overall clock');
    assert.throws(() => restarted.startStudentAttempt(pending.attemptId, pendingStudent, undefined, test.testId), /no disponible|cerrad|iniciar/i);
    const answered = restarted.answerStudentQuestion({ testId: test.testId, attemptId: inProgress.attemptId, accountPlayerId: activeStudent, questionId: continued.progress.questions[0].questionId, answer: continued.progress.questions[0].answer });
    assert.equal(answered.correct, true, 'an existing attempt can still submit answers after close');
    const result = restarted.finishStudentAttempt({ testId: test.testId, attemptId: inProgress.attemptId, accountPlayerId: activeStudent });
    assert.equal(result.attempt.status, 'finished');
    assert.equal(result.result.complete, true);
  } finally { box.dispose(); }
}

function checkLiveProgressDoesNotRacePauseOrFinish() {
  const box = sandbox('live-progress');
  try {
    const accountPlayerId = id();
    const test = box.service.create({ title: 'Progreso live ficticio', creator: id(), configuration: {
      grade: '5', enabledOperations: ['add'], operationOrder: ['add'], order: 'ordered', total: 4,
      answerMode: 'write', allowedAttempts: 1, opsConfig: { add: { qty: 4, digits: 1, carryMode: 'both' } },
    } });
    box.service.replaceAssignments(test.testId, [{ targetType: 'student', accountPlayerId }]);
    box.service.start(test.testId, test.revision + 1, { now: START, force: true });
    const pending = box.service.createStudentAttempt({ testId: test.testId, accountPlayerId });
    box.service.startStudentAttempt(pending.attemptId, accountPlayerId);
    const questions = pending.progress.questions;
    assert.equal(questions.length, 4);
    const examStartedAt = Date.parse(START);
    const publish = (count, states, targetService = box.service) => targetService.recordLiveExamProgress({ testId: test.testId, accountPlayerId, message: {
      examStartedAt, qIndex: count, examQuestions: questions.map((question, index) => ({
        questionId: question.questionId,
        status: states[index]?.status || 'pending',
        answer: states[index]?.answer ?? null,
      })),
    } });

    const first = publish(1, [{ status: 'correct', answer: questions[0].answer }]).attempt;
    assert.deepEqual(first.progress.answers.map(row => [row.questionId, row.corrected, row.timeout]), [[questions[0].questionId, true, false]]);
    const duplicateFirst = publish(1, [{ status: 'correct', answer: questions[0].answer }]).attempt;
    assert.equal(duplicateFirst.progress.answers.length, 1, 'repeated update does not duplicate the first response');

    const second = publish(2, [
      { status: 'correct', answer: questions[0].answer },
      { status: 'wrong', answer: questions[1].answer + 1 },
    ]).attempt;
    assert.deepEqual(second.progress.answers.map(row => row.corrected), [true, false], 'both a correct and incorrect response persist');
    const third = publish(3, [
      { status: 'correct', answer: questions[0].answer },
      { status: 'wrong', answer: questions[1].answer + 1 },
      { status: 'timeout' },
    ]).attempt;
    assert.equal(third.progress.answers[2].timeout, true, 'timeout is retained as a completed response');
    const last = publish(4, [
      { status: 'correct', answer: questions[0].answer },
      { status: 'wrong', answer: questions[1].answer + 1 },
      { status: 'timeout' },
      { status: 'correct', answer: questions[3].answer },
    ]).attempt;
    assert.equal(last.progress.currentIndex, 4);
    assert.deepEqual(last.progress.answers.map(row => [row.corrected, row.timeout]), [[true, false], [false, false], [false, true], [true, false]], 'the last response is saved before the result event');
    assert.equal(last.progress.correct, 2);
    assert.equal(last.progress.incorrect, 1);
    assert.equal(last.progress.timeout, 1);

    box.store.flushSync();
    const restartedStore = createTestStore({ baseDir: box.baseDir, logger: { error() {} } });
    const restarted = createTestService({ store: restartedStore, clock: () => new Date(CLOSE) });
    restarted.recoverAfterRestart({ now: Date.parse(CLOSE) });
    const recovered = restarted.startStudentAttempt(pending.attemptId, accountPlayerId);
    assert.deepEqual(recovered.progress.answers, last.progress.answers, 'restart retains every answer and timeout');
    assert.deepEqual(recovered.progress.questions.map(question => question.questionId), questions.map(question => question.questionId));

    let currentTest = restarted.get(test.testId);
    restarted.pause(test.testId, currentTest.revision + 1);
    const paused = restarted.getStudentAttempt(test.testId, pending.attemptId, accountPlayerId);
    const frozenProgress = JSON.stringify(paused.progress);
    assert.equal(publish(4, [{ status: 'correct', answer: questions[0].answer }], restarted).ignored, true, 'a late update after pause is ignored');
    assert.equal(JSON.stringify(restarted.getStudentAttempt(test.testId, pending.attemptId, accountPlayerId).progress), frozenProgress, 'late progress cannot overwrite the pause snapshot');

    currentTest = restarted.get(test.testId);
    restarted.resume(test.testId, currentTest.revision + 1);
    currentTest = restarted.get(test.testId);
    restarted.close(test.testId, currentTest.revision + 1);
    const finalMessage = { examStartedAt, total: 4, correct: 2, wrong: 1, timeout: 1, score: 2 };
    const result = restarted.recordLiveExamResult({ testId: test.testId, accountPlayerId, message: finalMessage });
    assert.equal(result.attempt.status, 'finished');
    assert.equal(restarted.recordLiveExamResult({ testId: test.testId, accountPlayerId, message: finalMessage }).duplicate, true);
    const finishedProgress = JSON.stringify(result.attempt.progress);
    assert.equal(restarted.recordLiveExamProgress({ testId: test.testId, accountPlayerId, message: { examStartedAt, qIndex: 4, examQuestions: [] } }).ignored, true, 'late progress after finalization is ignored');
    assert.equal(JSON.stringify(restarted.getStudentAttempt(test.testId, pending.attemptId, accountPlayerId).progress), finishedProgress, 'late progress cannot overwrite a finished attempt');
    assert.equal(restartedStore.load().results.filter(row => row.attemptId === pending.attemptId).length, 1, 'final retry does not duplicate results');
  } finally { box.dispose(); }
}

function checkManualOverridesAndUnschedule() {
  const box = sandbox('manual');
  try {
    const open = createAssigned(box.service, id(), 'Apertura manual');
    box.service.schedule(open.testId, open.revision + 1, { startsAt: START, closesAt: CLOSE });
    let current = box.service.get(open.testId);
    box.service.start(open.testId, current.revision + 1, { now: '2030-01-15T15:30:00.000Z', force: true });
    assert.equal(box.service.get(open.testId).availabilityOverride, 'open');
    box.service.evaluateAvailability('2030-01-15T15:00:00.000Z');
    box.service.evaluateAvailability('2030-01-15T18:00:00.000Z');
    assert.equal(box.service.get(open.testId).status, 'active', 'manual opening survives planner cycles and scheduled close');

    const closed = createAssigned(box.service, id(), 'Cierre manual');
    box.service.schedule(closed.testId, closed.revision + 1, { startsAt: START, closesAt: CLOSE });
    current = box.service.get(closed.testId);
    box.service.close(closed.testId, current.revision + 1);
    assert.equal(box.service.get(closed.testId).availabilityOverride, 'closed');
    box.service.evaluateAvailability('2030-01-15T18:00:00.000Z');
    assert.equal(box.service.get(closed.testId).status, 'closed', 'manual closure is not undone at scheduled opening');

    const cancel = createAssigned(box.service, id(), 'Retirar programa');
    box.service.schedule(cancel.testId, cancel.revision + 1, { startsAt: START, closesAt: CLOSE });
    current = box.service.get(cancel.testId);
    const draft = box.service.unschedule(cancel.testId, current.revision + 1);
    assert.equal(draft.status, 'draft');
    assert.equal(draft.startsAt, null);
    assert.equal(draft.closesAt, null);
    box.service.evaluateAvailability('2030-01-15T18:00:00.000Z');
    assert.equal(box.service.get(cancel.testId).status, 'draft', 'unscheduled draft does not activate later');
  } finally { box.dispose(); }
}

function checkArchiveRestore() {
  const box = sandbox('archive');
  try {
    const testId = id(), studentId = id(), attemptId = id();
    const test = createTest({ testId, title: 'Historial ficticio', folio: '0007', status: 'finished', creator: id(), configuration });
    const assignment = createAssignment({ testId, targetType: 'student', accountPlayerId: studentId });
    const attempt = createAttempt({ attemptId, testId, accountPlayerId: studentId, status: 'finished', configurationSnapshot: configuration, progress: { questions: [{ questionId: 'q1', a: 1, b: 1, answer: 2 }], answers: [{ questionId: 'q1', answer: 2, corrected: true }], currentIndex: 1 } });
    const result = createResult({ testId, attemptId, accountPlayerId: studentId, score: 10, correct: 1, total: 1, complete: true });
    const root = box.store.load(); root.tests.push(test); root.assignments.push(assignment); root.attempts.push(attempt); root.results.push(result); box.store.save(root);
    const before = JSON.stringify({ assignments: root.assignments, attempts: root.attempts, results: root.results });

    const archived = box.service.archive(testId, test.revision + 1);
    assert(archived.archivedAt);
    const library = createTestLibraryService({ loadRoot: () => box.store.load() });
    assert.equal(library.list({}).some(row => row.testId === testId), false, 'archived test is hidden in the ordinary history');
    assert.equal(library.list({ includeArchived: true }).some(row => row.testId === testId), true, 'archived filter includes it');
    const restored = box.service.restore(testId, archived.revision + 1);
    assert.equal(restored.status, 'finished', 'restoring does not reactivate the test');
    assert.equal(restored.archivedAt, null);
    const after = box.store.load();
    assert.equal(JSON.stringify({ assignments: after.assignments, attempts: after.attempts, results: after.results }), before, 'archive/restore preserves assignment, attempt and result data');
    assert.equal(after.events.filter(row => row.action === 'test_archived').length, 1);
    assert.equal(after.events.filter(row => row.action === 'test_restored_to_history').length, 1);
  } finally { box.dispose(); }
}

function checkDraftDeletionGuards() {
  const box = sandbox('delete');
  try {
    const empty = createAssigned(box.service, id(), 'Borrador eliminable');
    const deleted = box.service.deleteDraft(empty.testId, empty.revision + 1);
    assert.equal(deleted.deleted, true);
    assert.throws(() => box.service.get(empty.testId), /no encontrada/i);
    assert.equal(box.store.load().assignments.some(row => row.testId === empty.testId), false, 'draft-owned assignments are cleaned up');

    const attempted = box.service.create({ title: 'Borrador con intento lÃ³gico', creator: id(), configuration });
    const prior = createAttempt({ testId: attempted.testId, accountPlayerId: id(), status: 'deleted' });
    const root = box.store.load(); root.attempts.push(prior); box.store.save(root);
    assert.throws(() => box.service.deleteDraft(attempted.testId, attempted.revision + 1), /intento|historial|registro/i);
    assert(box.store.load().tests.some(row => row.testId === attempted.testId), 'logical deletion does not erase test history');
    assert(box.store.load().attempts.some(row => row.attemptId === prior.attemptId), 'logical deleted attempt remains preserved');

    for (const key of ['results', 'officialAttempts', 'rankingPublications', 'rewardSettlements']) {
      const derived = box.service.create({ title: `Borrador con ${key}`, creator: id(), configuration });
      const state = box.store.load();
      state[key] = [...(state[key] || []), { testId: derived.testId, attemptId: id(), accountPlayerId: id(), id: id() }];
      box.store.save(state);
      assert.throws(() => box.service.deleteDraft(derived.testId, derived.revision + 1), /registro|resultado|public|liquid|intento|historial/i, `${key} blocks draft deletion`);
      assert(box.store.load().tests.some(row => row.testId === derived.testId), `${key} guard must preserve draft and related records`);
    }

    for (const status of ['active', 'finished', 'cancelled']) {
      const protectedTest = createTest({ testId: id(), title: `Estado ${status}`, status, creator: id(), configuration });
      const state = box.store.load(); state.tests.push(protectedTest); box.store.save(state);
      assert.throws(() => box.service.deleteDraft(protectedTest.testId, protectedTest.revision + 1), /borrador|estado/i, `${status} test cannot be deleted as a draft`);
    }
  } finally { box.dispose(); }
}

checkScheduleAndExistingAttempt();
checkLiveProgressDoesNotRacePauseOrFinish();
checkManualOverridesAndUnschedule();
checkArchiveRestore();
checkDraftDeletionGuards();
console.log('OK PRUEBAS.7: lÃ­mites horarios exactos, continuaciÃ³n tras cierre/reinicio, overrides manuales, retiro de programaciÃ³n, archivo/restauraciÃ³n reversible y eliminaciÃ³n segura de borradores.');
