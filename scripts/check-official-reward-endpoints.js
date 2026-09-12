'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const { spawn } = require('child_process');
const { createRoot, createTest, createAttempt, createResult } = require('../src/server/exams/testModel');

const ids = {
  test: '11111111-1111-4111-8111-111111111111', attempt: '22222222-2222-4222-8222-222222222222',
  student: '33333333-3333-4333-8333-333333333333', creator: '44444444-4444-4444-8444-444444444444',
  official: '55555555-5555-4555-8555-555555555555', publication: '66666666-6666-4666-8666-666666666666',
  result: '77777777-7777-4777-8777-777777777777', event: '88888888-8888-4888-8888-888888888888',
};
const other = n => `99999999-9999-4999-8999-${String(n).padStart(12, '0')}`;
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const freePort = () => new Promise(resolve => { const server = net.createServer(); server.listen(0, '127.0.0.1', () => { const port = server.address().port; server.close(() => resolve(port)); }); });

function createFixture(dir) {
  const root = createRoot();
  const test = createTest({ testId: ids.test, title: 'HTTP recompensas', creator: ids.creator, status: 'active' });
  const attempt = createAttempt({ attemptId: ids.attempt, testId: ids.test, accountPlayerId: ids.student, status: 'finished' });
  const result = createResult({ resultId: ids.result, attemptId: ids.attempt, testId: ids.test, accountPlayerId: ids.student, score: 500, correct: 5, incorrect: 0 });
  Object.assign(result, { name: 'Ana', grade: '5A', total: 5, pct: 100, streak: 0, op: '×', gameType: 'timed', difficulty: 'medium', tblResults: {}, complete: true });
  const record = { ...result, id: ids.publication, wrong: 0, rankingPublicationId: ids.publication, complete: true };
  root.tests.push(test); root.attempts.push(attempt); root.results.push(result);
  root.officialAttempts = [{ officialAttemptId: ids.official, testId: ids.test, attemptId: ids.attempt, accountPlayerId: ids.student, resultId: ids.result, resultSnapshot: result }];
  root.rankingPublications = [{ rankingPublicationId: ids.publication, testId: ids.test, attemptId: ids.attempt, officialAttemptId: ids.official, accountPlayerId: ids.student, record }];
  fs.writeFileSync(path.join(dir, 'pruebas.json'), JSON.stringify(root), 'utf8');
  fs.writeFileSync(path.join(dir, 'ranking.json'), JSON.stringify([{ id: 'legacy', name: 'Legado', score: 1 }]), 'utf8');
  fs.writeFileSync(path.join(dir, 'players.json'), JSON.stringify([{ id: ids.student, name: 'Ana', grade: '5A', aureos: 0, experiencia: 0, dailyStreak: { current: 0, best: 0, lastDate: '01/01/2000' }, achievements: [], gamesPlayed: 2 }]), 'utf8');
}

async function startServer(dir, port, testsFile) {
  const child = spawn(process.execPath, ['server.js'], { cwd: process.cwd(), windowsHide: true, stdio: 'ignore', env: { ...process.env, PORT: String(port), MATH_ATTACK_DATA_PATH: dir, MATH_ATTACK_TESTS_PATH: testsFile } });
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 50; i += 1) {
    try { if ((await fetch(`${base}/api/exam/status`)).ok) return { child, base }; } catch (_) {}
    await wait(100);
  }
  child.kill('SIGINT');
  throw Error('servidor HTTP no inicio');
}

async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'math-attack-official-reward-http-'));
  const testsFile = path.join(dir, 'pruebas.json');
  let child;
  try {
    createFixture(dir);
    const port = await freePort();
    let running = await startServer(dir, port, testsFile);
    ({ child } = running);
    const base = running.base;
    const endpoint = `/api/maestro/tests/${ids.test}/attempts/${ids.attempt}/rewards`;
    const post = (data, headers = {}) => fetch(base + endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(data) });
    const get = (query, headers = {}) => fetch(base + endpoint + query, { headers });
    const adminHeaders = { 'x-admin-password': 'admin' };
    const valid = { officialAttemptId: ids.official, rankingPublicationId: ids.publication, eventId: ids.event, reason: 'liquidar oficial' };

    assert.equal((await post(valid)).status, 401);
    assert.equal((await post({ ...valid, password: 'incorrecta' })).status, 401);
    assert.equal((await post({ ...valid, pwd: 'admin' }, { Cookie: 'math_attack_student_session=sesion-alumno' })).status, 401);
    assert.equal((await get('')).status, 401);
    assert.equal((await get('?officialAttemptId=' + ids.official + '&rankingPublicationId=' + ids.publication + '&password=incorrecta')).status, 401);

    const response = await post({ ...valid, aureos: 999999, experience: 999999, achievements: ['inventado'] }, adminHeaders);
    assert.equal(response.status, 201);
    const body = await response.json();
    assert.equal(body.settlement.rewardSettlementId.length, 36);
    const settlementId = body.settlement.rewardSettlementId;
    assert(!JSON.stringify(body).includes('no-debe-aparecer'));
    assert(!JSON.stringify(body).includes('999999'));
    assert.equal((await get(`?officialAttemptId=${ids.official}&rankingPublicationId=${ids.publication}`, adminHeaders)).status, 200);

    const duplicate = await post(valid, adminHeaders);
    assert.equal(duplicate.status, 200);
    const duplicateBody = await duplicate.json();
    assert.equal(duplicateBody.duplicate, true);
    assert.equal(duplicateBody.settlement.rewardSettlementId, settlementId);
    const beforeEquivalentPlayer = JSON.parse(fs.readFileSync(path.join(dir, 'players.json'), 'utf8'))[0];
    const beforeEquivalentRoot = JSON.parse(fs.readFileSync(testsFile, 'utf8'));
    assert.equal((await post({ ...valid, reason: 'motivo distinto' }, adminHeaders)).status, 409);
    const equivalent = await post({ ...valid, eventId: other(1), reason: 'otro reintento' }, adminHeaders);
    assert.equal(equivalent.status, 201);
    const equivalentBody = await equivalent.json();
    assert.equal(equivalentBody.settlement.status, 'completed');
    assert.equal(equivalentBody.duplicate, false);
    assert.equal(equivalentBody.settlement.rewardSettlementId, settlementId);
    assert.equal(equivalentBody.settlement.eventId, ids.event);
    const afterEquivalentPlayer = JSON.parse(fs.readFileSync(path.join(dir, 'players.json'), 'utf8'))[0];
    const afterEquivalentRoot = JSON.parse(fs.readFileSync(testsFile, 'utf8'));
    assert.equal(afterEquivalentPlayer.aureos, beforeEquivalentPlayer.aureos);
    assert.equal(afterEquivalentPlayer.experiencia, beforeEquivalentPlayer.experiencia);
    assert.deepEqual(afterEquivalentPlayer.officialRewardLedger, beforeEquivalentPlayer.officialRewardLedger);
    assert.equal(afterEquivalentRoot.rewardSettlements.length, beforeEquivalentRoot.rewardSettlements.length);
    assert.equal(afterEquivalentRoot.events.length, beforeEquivalentRoot.events.length);

    for (const invalid of [
      { ...valid, officialAttemptId: other(2) },
      { ...valid, rankingPublicationId: other(3) },
      { ...valid, testId: other(4) },
      { ...valid, attemptId: other(5) },
    ]) assert.equal((await fetch(base + `/api/maestro/tests/${invalid.testId || ids.test}/attempts/${invalid.attemptId || ids.attempt}/rewards`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...adminHeaders }, body: JSON.stringify(invalid) })).status >= 400, true);

    await wait(100);
    const players = JSON.parse(fs.readFileSync(path.join(dir, 'players.json'), 'utf8'));
    const player = players[0];
    assert.equal(player.aureos, 65);
    assert.equal(player.experiencia, 15);
    assert.equal(player.officialRewardLedger.length, 4);
    assert.equal(new Set(player.officialRewardLedger.map(item => item.key)).size, 4);
    assert.deepEqual(player.achievements, ['perfect']);
    const rootAfter = JSON.parse(fs.readFileSync(testsFile, 'utf8'));
    assert.equal(rootAfter.rewardSettlements.length, 1);
    assert.equal(rootAfter.rewardSettlements[0].rewardSettlementId, settlementId);
    assert.equal(rootAfter.events.filter(item => item.eventId === ids.event).length, 1);
    const rankingBefore = fs.readFileSync(path.join(dir, 'ranking.json'), 'utf8');

    child.kill('SIGINT');
    await wait(150);
    running = await startServer(dir, await freePort(), testsFile);
    ({ child } = running);
    const restarted = await fetch(running.base + endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', ...adminHeaders }, body: JSON.stringify(valid) });
    assert.equal(restarted.status, 200);
    assert.equal((await restarted.json()).duplicate, true);
    assert.equal(fs.readFileSync(path.join(dir, 'ranking.json'), 'utf8'), rankingBefore);
    assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'players.json'), 'utf8'))[0].aureos, 65);
    child.kill('SIGINT');
    console.log('OK: ruta administrativa de recompensas autentica, valida publicación, conserva ledger, IDs, idempotencia y aislamiento temporal.');
  } finally {
    if (child && !child.killed) child.kill('SIGINT');
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

main().catch(error => { console.error(error); process.exit(1); });
