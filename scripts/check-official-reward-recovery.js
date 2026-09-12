'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { randomUUID } = require('crypto');
const { createJsonStore } = require('../src/data/jsonStore');
const { createTestStore } = require('../src/server/exams/testStore');
const { createRoot, createTest, createAttempt, createResult } = require('../src/server/exams/testModel');
const { createOfficialRewardService } = require('../src/server/exams/officialRewardService');
const { calculateGameRewards } = require('../src/game/gameRewards');
const { calculateDailyStreak } = require('../src/game/dailyStreak');
const { checkNewAchievements, ACHIEVEMENTS_DEF } = require('../src/game/achievements');

const id = () => randomUUID();
const effectNames = ['aureos', 'experience', 'streak', 'achievement:perfect'];

function createFixture(dir) {
  const testId = id();
  const attemptId = id();
  const accountPlayerId = id();
  const officialAttemptId = id();
  const rankingPublicationId = id();
  const eventId = id();
  // La prueba puede estar activa; la publicación oficial se representa en
  // root.rankingPublications, no como un estado adicional del test.
  const test = createTest({ testId, title: 'Recuperación', status: 'active', creator: id() });
  const attempt = createAttempt({ attemptId, testId, accountPlayerId, status: 'finished', finishedAt: new Date().toISOString() });
  const result = createResult({ resultId: id(), attemptId, testId, accountPlayerId, score: 500, correct: 5, incorrect: 0 });
  Object.assign(result, {
    name: 'Ana', grade: '5A', total: 5, pct: 100, streak: 0, op: '×', gameType: 'timed', difficulty: 'medium',
    tblResults: { '2': { total: 5, correct: 5, incorrect: 0 } }, complete: true,
  });
  const root = createRoot();
  root.tests.push(test);
  root.attempts.push(attempt);
  root.results.push(result);
  root.officialAttempts = [{ officialAttemptId, testId, attemptId, accountPlayerId, resultId: result.resultId, resultSnapshot: result }];
  root.rankingPublications = [{ rankingPublicationId, testId, attemptId, officialAttemptId, accountPlayerId,
    record: { ...result, id: rankingPublicationId, wrong: 0, rankingPublicationId, complete: true } }];
  const player = { id: accountPlayerId, name: 'Ana', grade: '5A', aureos: 0, experiencia: 0,
    dailyStreak: { current: 0, best: 0, lastDate: '01/01/2000' }, achievements: [], gamesPlayed: 4 };
  const testStore = createTestStore({ baseDir: dir, fileName: 'pruebas.json', logger: { error() {} } });
  // jsonStore escribe players.json de forma asíncrona; para cerrar el fixture
  // sin depender de su caché, se deja el archivo temporal materializado antes
  // de simular la reapertura.
  fs.writeFileSync(path.join(dir, 'players.json'), JSON.stringify([player]), 'utf8');
  const reopenedPlayers = createJsonStore({ baseDir: dir, logger: { err() {}, game() {} } }).loadPlayers();
  assert.equal(reopenedPlayers.length, 1, 'el alumno debe persistir en el fixture');
  assert.equal(reopenedPlayers[0].id, accountPlayerId, 'accountPlayerId persistido inconsistente');
  testStore.save(root);
  testStore.flushSync();
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'pruebas.json'), 'utf8')).rankingPublications[0].accountPlayerId, accountPlayerId);
  return { ids: { testId, attemptId, accountPlayerId, officialAttemptId, rankingPublicationId, eventId }, dir };
}

function openService(fixture, failAt = null) {
  const testStore = createTestStore({ baseDir: fixture.dir, fileName: 'pruebas.json', logger: { error() {} } });
  const root = testStore.load();
  const playersFile = path.join(fixture.dir, 'players.json');
  const aureosLogFile = path.join(fixture.dir, 'aureosLog.json');
  const readArray = file => {
    try { const value = JSON.parse(fs.readFileSync(file, 'utf8')); return Array.isArray(value) ? value : []; }
    catch (_) { return []; }
  };
  const writeArray = (file, value) => {
    const temporary = `${file}.fixture.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(value), 'utf8');
    fs.renameSync(temporary, file);
  };
  // Adaptador síncrono exclusivo del fixture: jsonStore no expone una Promise
  // de finalización y no se debe simular el reinicio con una escritura pendiente.
  const loadPlayers = () => readArray(playersFile);
  const savePlayers = players => writeArray(playersFile, players);
  const logAureosTx = (player, delta, reason) => {
    if (!delta) return;
    const log = readArray(aureosLogFile);
    log.push({ delta, reason, balance: player.aureos || 0, playerId: player.id || '' });
    writeArray(aureosLogFile, log);
  };
  const persistedPlayers = loadPlayers();
  assert.equal(persistedPlayers.length, 1, 'el alumno no se reabrio desde el store temporal');
  assert.equal(persistedPlayers[0].id, root.attempts[0].accountPlayerId, 'accountPlayerId no coincide tras reabrir');
  let persistCalls = 0;
  const persist = () => {
    persistCalls += 1;
    testStore.save(root);
    testStore.flushSync();
    if (failAt !== null && persistCalls === failAt) throw Error(`fallo controlado en persist ${persistCalls}`);
  };
  const service = createOfficialRewardService({
    root, loadPlayers, savePlayers, loadRanking: () => [], persist, logAureosTx,
    calculateGameRewards, calculateDailyStreak, checkNewAchievements, achievementsDef: ACHIEVEMENTS_DEF,
  });
  return { service, root, dataStore: { loadPlayers, savePlayers, logAureosTx }, testStore, persistCalls: () => persistCalls };
}

function request(ids, eventId = ids.eventId, reason = 'recuperacion por efecto') {
  return { ...ids, eventId, actor: 'admin', reason };
}

function readPlayer(dir) {
  return createJsonStore({ baseDir: dir, logger: { err() {}, game() {} } }).loadPlayers()[0];
}

function runScenario(effectIndex) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'math-attack-reward-recovery-'));
  try {
    const fixture = createFixture(dir);
    const first = openService(fixture, effectIndex + 2); // persist #1 registra; #2 es el primer efecto
    assert.throws(() => first.service.settle(request(fixture.ids)), new RegExp(`fallo controlado en persist ${effectIndex + 2}`));
    const pending = first.root.rewardSettlements[0];
    assert.equal(pending.status, 'pending');
    const pendingId = pending.rewardSettlementId;
    const pendingLedger = readPlayer(dir).officialRewardLedger || [];
    assert.equal(pendingLedger.length, effectIndex + 1, `ledger inesperado tras ${effectNames[effectIndex]}`);
    const pendingKeys = pendingLedger.map(item => item.key);
    assert(pendingKeys.includes(`${pendingId}:aureos`) || effectIndex > 0, 'falta la marca persistente de Áureos');
    for (const laterEffect of effectNames.slice(effectIndex + 1)) {
      assert(!pendingKeys.includes(`${pendingId}:${laterEffect}`), `efecto prematuro en ledger: ${laterEffect}`);
    }

    const restarted = openService(fixture);
    const recovered = restarted.service.settle(request(fixture.ids));
    assert.equal(recovered.settlement.status, 'completed');
    assert.equal(recovered.settlement.rewardSettlementId, pendingId);
    assert.equal(restarted.root.rewardSettlements.length, 1);
    const finalPlayer = readPlayer(dir);
    const ledger = finalPlayer.officialRewardLedger || [];
    assert.equal(new Set(ledger.map(item => item.key)).size, ledger.length);
    assert.equal(ledger.length, 4);
    assert.equal(finalPlayer.aureos, 65);
    assert.equal(finalPlayer.experiencia, 15);
    assert.equal(finalPlayer.dailyStreak.current, 1);
    assert.deepEqual(finalPlayer.achievements, ['perfect']);
    assert.equal(restarted.root.events.filter(item => item.eventId === fixture.ids.eventId).length, 1);

    const repeated = restarted.service.settle(request(fixture.ids));
    assert.equal(repeated.duplicate, true);
    assert.equal(repeated.settlement.rewardSettlementId, pendingId);
    assert.equal(readPlayer(dir).aureos, 65);
    assert.throws(() => restarted.service.settle(request(fixture.ids, fixture.ids.eventId, 'motivo contradictorio')), /eventId contradictorio/);
    assert.equal(restarted.root.rewardSettlements.length, 1);
    assert.equal(readPlayer(dir).aureos, 65);
    return { effect: effectNames[effectIndex], rewardSettlementId: pendingId, ledger: ledger.map(item => item.key), status: recovered.settlement.status };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

if (require.main === module) {
  const outcomes = [0, 1, 2, 3].map(runScenario);
  console.log(`OK official reward recovery by effect: ${outcomes.map(item => item.effect).join(', ')}`);
  console.log(`OK settlement estable, ledger unico, auditoria unica y saldo sin duplicacion: ${outcomes.length} escenarios`);
}

module.exports = { createFixture, openService, runScenario };
