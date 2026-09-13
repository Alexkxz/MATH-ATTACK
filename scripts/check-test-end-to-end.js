'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const { spawn } = require('child_process');
const { createTestStore } = require('../src/server/exams/testStore');
const { createTestService } = require('../src/server/exams/testService');
const { createAttemptCheckpointService } = require('../src/server/exams/attemptCheckpointService');
const { createAttemptActionService } = require('../src/server/exams/attemptActionService');
const { createOfficialAttemptService } = require('../src/server/exams/officialAttemptService');
const { createOfficialRewardService } = require('../src/server/exams/officialRewardService');
const { createResult, createEvent, transitionAttempt } = require('../src/server/exams/testModel');
const { ACHIEVEMENTS_DEF, checkNewAchievements } = require('../src/game/achievements');
const { calculateDailyStreak } = require('../src/game/dailyStreak');
const { calculateGameRewards } = require('../src/game/gameRewards');
const { ensurePlayerExperience } = require('../src/game/playerLevels');
const { buildRankingCsv } = require('../src/game/ranking');
const { chromium } = require('playwright');

const ids = {
  test: '11111111-1111-4111-8111-111111111111',
  attempt: '22222222-2222-4222-8222-222222222222',
  student: '33333333-3333-4333-8333-333333333333',
  creator: '44444444-4444-4444-8444-444444444444',
};
const event = n => `55555555-5555-4555-8555-${String(n).padStart(12, '0')}`;
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const freePort = () => new Promise(resolve => {
  const probe = net.createServer();
  probe.listen(0, '127.0.0.1', () => { const port = probe.address().port; probe.close(() => resolve(port)); });
});

function startServer(dir, port) {
  const child = spawn(process.execPath, ['server.js'], {
    cwd: process.cwd(), windowsHide: true, stdio: 'ignore',
    env: { ...process.env, PORT: String(port), MATH_ATTACK_DATA_PATH: dir, MATH_ATTACK_TESTS_PATH: path.join(dir, 'pruebas.json') },
  });
  const base = `http://127.0.0.1:${port}`;
  return (async () => {
    for (let i = 0; i < 60; i += 1) {
      try { if ((await fetch(`${base}/api/ranking`)).ok) return { child, base }; } catch (_) {}
      await wait(100);
    }
    child.kill('SIGINT');
    throw Error('servidor integral no inicio');
  })();
}

function writePlayer(dir) {
  fs.writeFileSync(path.join(dir, 'players.json'), JSON.stringify([{
    id: ids.student, name: 'Alumno integral', pin: '1234', grade: '5A', aureos: 0,
    experiencia: 0, dailyStreak: { current: 0, best: 0, lastDate: '01/01/2000' },
    achievements: [], gamesPlayed: 0,
  }]), 'utf8');
}

async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'math-attack-e2e-'));
  fs.writeFileSync(path.join(dir, 'ranking.json'), JSON.stringify([{ id: 'normal-1', name: 'Partida normal', score: 2 }]), 'utf8');
  writePlayer(dir);
  let server;
  try {
    let store = createTestStore({ baseDir: dir });
    let root = store.load();
    let tests = createTestService({ store });
    const test = tests.create({ testId: ids.test, title: 'Prueba integral', creator: ids.creator, configuration: { grade: '5A', total: 5 } });
    // Este escenario valida compatibilidad con una prueba legacy: sin bloque rewards
    // conserva deliberadamente la liquidacion historica de cuatro efectos.
    delete test.configuration.rewards;
    assert.equal(test.status, 'draft');
    tests.update(ids.test, 2, { title: 'Prueba integral editada', configuration: test.configuration });
    assert.equal(tests.schedule(ids.test, 3, { startsAt: '2030-01-01T10:00:00.000Z' }).status, 'scheduled');
    assert.equal(tests.start(ids.test, 4, { now: '2030-01-01T10:00:00.000Z' }).status, 'active');
    tests.replaceAssignments(ids.test, [
      { targetType: 'student', accountPlayerId: ids.student },
      { targetType: 'group', groupId: '5A' },
    ]);
    assert.equal(tests.listAssignments(ids.test).length, 2);

    const attempt = tests.createStudentAttempt({ testId: ids.test, accountPlayerId: ids.student, groupId: '5A', studentSnapshot: { name: 'Alumno integral', grade: '5A' } });
    assert.equal(attempt.status, 'pending');
    const started = tests.startStudentAttempt(attempt.attemptId, ids.student);
    assert.equal(started.status, 'in_progress');
    root = store.load();
    const revisionAfterStart = root.attempts.find(item => item.attemptId === attempt.attemptId).revision;
    assert.equal(started.revision, revisionAfterStart);
    const checkpoints = createAttemptCheckpointService({ store });
    const checkpointInput = { testId: ids.test, attemptId: attempt.attemptId, accountPlayerId: ids.student, revision: 2, eventId: event(1), index: 1, correct: 1, incorrect: 0, answers: ['ok'], progress: { current: 1 } };
    assert.equal(checkpoints.saveAttemptCheckpoint(checkpointInput).duplicate, false);
    assert.equal(checkpoints.saveAttemptCheckpoint(checkpointInput).duplicate, true);
    root = store.load();
    const revisionBeforeReentry = root.attempts.find(item => item.attemptId === attempt.attemptId).revision;
    assert.equal(revisionBeforeReentry, revisionAfterStart);
    // El contrato no expone una acción administrativa de desconexión; se simula
    // el evento de transporte sobre el modelo persistido antes de reentrar.
    const disconnected = root.attempts.find(item => item.attemptId === attempt.attemptId);
    assert.equal(disconnected.status, 'in_progress');
    transitionAttempt(disconnected, 'disconnected');
    store.save(root);
    root = store.load();
    const revisionAfterDisconnect = root.attempts.find(item => item.attemptId === attempt.attemptId).revision;
    assert.equal(root.attempts.find(item => item.attemptId === attempt.attemptId).status, 'disconnected');
    assert(revisionAfterDisconnect > revisionBeforeReentry);
    assert.equal(root.checkpoints.filter(item => item.attemptId === attempt.attemptId).length, 1);
    const actions = createAttemptActionService({ root, persist: () => store.save(root) });
    assert.throws(() => actions.allowReentry({ testId: ids.test, attemptId: attempt.attemptId, actor: 'admin', revision: revisionAfterDisconnect, eventId: event(20), reason: 'revision antigua' }), /revision antigua/);
    const reentered = actions.allowReentry({ testId: ids.test, attemptId: attempt.attemptId, actor: 'admin', revision: revisionAfterDisconnect + 1, eventId: event(2), reason: 'reconexion' }).attempt;
    assert.equal(reentered.status, 'reconnected');
    assert.equal(reentered.attemptId, attempt.attemptId);
    const closed = actions.closeAttempt({ testId: ids.test, attemptId: attempt.attemptId, actor: 'admin', revision: reentered.revision + 1, eventId: event(3), reason: 'resultado recibido' }).attempt;
    assert.equal(closed.status, 'finished');
    assert.equal(closed.attemptId, attempt.attemptId);

    root = store.load();
    const result = createResult({ resultId: '66666666-6666-4666-8666-666666666666', testId: ids.test, attemptId: attempt.attemptId, accountPlayerId: ids.student, score: 500, correct: 5, incorrect: 0 });
    Object.assign(result, { name: 'Alumno integral', grade: '5A', total: 5, pct: 100, complete: true, streak: 0, gameType: 'timed', op: '×', tblResults: {}, progress: { studentSnapshot: { name: 'Alumno integral', grade: '5A' } } });
    root.results.push(result);
    store.save(root);

    const loadRanking = () => JSON.parse(fs.readFileSync(path.join(dir, 'ranking.json'), 'utf8'));
    const saveRanking = rows => fs.writeFileSync(path.join(dir, 'ranking.json'), JSON.stringify(rows), 'utf8');
    root = store.load();
    const official = createOfficialAttemptService({ root, loadRanking, saveRanking, persist: () => store.save(root) });
    const officialized = official.officialize({ testId: ids.test, attemptId: attempt.attemptId, accountPlayerId: ids.student, actor: 'admin', eventId: event(4), reason: 'validar resultado' });
    assert.equal(officialized.duplicate, false);
    assert(officialized.officialAttempt.officialAttemptId);
    const published = official.publish({ testId: ids.test, attemptId: attempt.attemptId, actor: 'admin', eventId: event(5), reason: 'publicar resultado' });
    assert.equal(published.duplicate, false);
    assert(published.publication.rankingPublicationId);

    root = store.load();
    const playersFile = path.join(dir, 'players.json');
    const reward = createOfficialRewardService({
      root, loadPlayers: () => JSON.parse(fs.readFileSync(playersFile, 'utf8')),
      savePlayers: players => fs.writeFileSync(playersFile, JSON.stringify(players), 'utf8'),
      loadRanking, saveRanking, persist: () => store.save(root),
      calculateGameRewards, calculateDailyStreak, checkNewAchievements, achievementsDef: ACHIEVEMENTS_DEF,
      ensurePlayerExperience,
    });
    const rewardInput = { testId: ids.test, attemptId: attempt.attemptId, officialAttemptId: officialized.officialAttempt.officialAttemptId, rankingPublicationId: published.publication.rankingPublicationId, accountPlayerId: ids.student, actor: 'admin', eventId: event(6), reason: 'liquidar resultado' };
    const settled = reward.settle(rewardInput);
    assert.equal(settled.settlement.status, 'completed');
    assert(settled.settlement.rewardSettlementId);
    assert.equal(JSON.parse(fs.readFileSync(playersFile, 'utf8'))[0].officialRewardLedger.length, 4);

    store = createTestStore({ baseDir: dir });
    root = store.load();
    const rewardAfterRestart = createOfficialRewardService({
      root, loadPlayers: () => JSON.parse(fs.readFileSync(playersFile, 'utf8')),
      savePlayers: players => fs.writeFileSync(playersFile, JSON.stringify(players), 'utf8'),
      loadRanking, saveRanking, persist: () => store.save(root),
      calculateGameRewards, calculateDailyStreak, checkNewAchievements, achievementsDef: ACHIEVEMENTS_DEF,
      ensurePlayerExperience,
    });
    const duplicateReward = rewardAfterRestart.settle(rewardInput);
    assert.equal(duplicateReward.duplicate, true);
    assert.equal(duplicateReward.settlement.rewardSettlementId, settled.settlement.rewardSettlementId);
    assert.equal(JSON.parse(fs.readFileSync(playersFile, 'utf8'))[0].officialRewardLedger.length, 4);
    assert.equal(root.events.filter(item => item.eventId === event(6)).length, 1);

    const generalCsv = buildRankingCsv(loadRanking());
    assert(generalCsv.includes('Partida normal'));
    assert(generalCsv.includes('Alumno integral'));
    assert(generalCsv.includes('500'));
    const rankingHtml = fs.readFileSync('ranking.html', 'utf8');
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage();
      await page.route('http://ranking.test/ranking', route => route.fulfill({ status: 200, contentType: 'text/html', body: rankingHtml }));
      await page.route('http://ranking.test/chart.umd.min.js', route => route.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
      await page.route('http://ranking.test/api/ranking', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(loadRanking()) }));
      await page.route('http://ranking.test/api/players', route => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
      await page.goto('http://ranking.test/ranking', { waitUntil: 'networkidle' });
      await page.locator('[data-tab="pruebas"]').click();
      await page.waitForFunction(() => document.querySelector('[data-exam-analytics]'));
      const officialDownload = await Promise.all([
        page.waitForEvent('download'),
        page.locator('#exportOfficialTestsBtn').click(),
      ]).then(([download]) => download);
      const csv = fs.readFileSync(await officialDownload.path(), 'utf8');
      assert(csv.includes(ids.test));
      assert(csv.includes(officialized.officialAttempt.officialAttemptId));
      assert(csv.includes(published.publication.rankingPublicationId));
      assert(!csv.includes('Partida normal'));
    } finally {
      await browser.close();
    }
    server = await startServer(dir, await freePort());
    const admin = { 'X-Admin-Password': 'admin' };
    assert.equal((await fetch(`${server.base}/api/maestro/tests`)).status, 401);
    const testsResponse = await fetch(`${server.base}/api/maestro/tests`, { headers: admin });
    assert.equal(testsResponse.status, 200);
    const studentAuth = await fetch(`${server.base}/api/student/auth`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Alumno integral', pin: '1234' }) });
    assert.equal(studentAuth.status, 200);
    const studentCookie = studentAuth.headers.get('set-cookie');
    assert(studentCookie);
    assert.equal((await fetch(`${server.base}/api/maestro/tests`, { headers: { Cookie: studentCookie } })).status, 401);
    assert.equal((await fetch(`${server.base}/api/ranking`)).status, 200);
    assert.equal((await fetch(`${server.base}/api/ranking/export`, { headers: admin })).status, 200);
    assert(!JSON.stringify(await testsResponse.json()).match(/password|token|cookie|session/i));
    console.log('OK: flujo integral temporal draft→scheduled→active→intento→checkpoint→recuperación→finished→oficialización→publicación→recompensas, reinicio, autenticación, Ranking y exportación.');
  } finally {
    if (server?.child && !server.child.killed) server.child.kill('SIGINT');
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

main().catch(error => { console.error(error); process.exit(1); });
