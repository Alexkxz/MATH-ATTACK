'use strict';

const assert = require('assert');
const { randomUUID } = require('crypto');
const { createOfficialRewardService } = require('../src/server/exams/officialRewardService');
const { calculateGameRewards } = require('../src/game/gameRewards');
const { calculateDailyStreak } = require('../src/game/dailyStreak');
const { ensurePlayerExperience } = require('../src/game/playerLevels');
const { ACHIEVEMENTS_DEF, checkNewAchievements } = require('../src/game/achievements');

const id = () => randomUUID();
const validTest = id();
const playerId = id();
const attemptId = id();
const officialAttemptId = id();
const publicationId = id();
const resultId = id();
const eventId = id();

function resultFor(idAttempt, complete = true) {
  return {
    resultId: id(), attemptId: idAttempt, testId: validTest, accountPlayerId: playerId,
    name: 'Ana', grade: '5A', score: 1000, correct: 10, incorrect: 0, wrong: 0,
    total: 10, pct: 100, streak: 20, op: '×', gameType: 'timed', difficulty: 'medium',
    tblResults: { '2': { total: 10, correct: 10, incorrect: 0 } }, complete,
  };
}

const record = resultFor(attemptId);
record.rankingPublicationId = publicationId;
const root = {
  schemaVersion: 1, tests: [{ testId: validTest, status: 'published' }], assignments: [], checkpoints: [], events: [],
  attempts: [{ attemptId, testId: validTest, accountPlayerId: playerId, status: 'finished' }],
  results: [record], officialAttempts: [{
    officialAttemptId, testId: validTest, attemptId, accountPlayerId: playerId,
    resultId: resultId, resultSnapshot: record,
  }], rankingPublications: [{
    rankingPublicationId: publicationId, testId: validTest, attemptId, officialAttemptId,
    accountPlayerId: playerId, record,
  }],
};
const player = { id: playerId, name: 'Ana', grade: '5A', aureos: 10, experiencia: 0,
  dailyStreak: { current: 0, best: 0, lastDate: '01/01/2000' }, achievements: [], gamesPlayed: 7 };
let players = [player];
let persistCount = 0;
let failSave = false;
const logs = [];
const serviceOptions = () => ({
  root, loadPlayers: () => players, savePlayers: value => { if (failSave) { failSave = false; throw Error('fallo de persistencia'); } players = value; },
  loadRanking: () => [record], persist: () => { persistCount += 1; },
  logAureosTx: (item, delta, reason) => logs.push({ id: item.id, delta, reason }),
  calculateGameRewards, calculateDailyStreak, checkNewAchievements, achievementsDef: ACHIEVEMENTS_DEF,
});

function rejected(fn, text) {
  assert.throws(fn, error => error.message === text, text);
}

// Las variantes sin publicación oficial se rechazan antes de tocar jugadores.
const invalidRoot = JSON.parse(JSON.stringify(root));
invalidRoot.rankingPublications = [];
rejected(() => createOfficialRewardService({ ...serviceOptions(), root: invalidRoot }).settle({
  testId: validTest, attemptId, officialAttemptId, rankingPublicationId: publicationId,
  eventId: id(), actor: 'admin', reason: 'sin publicacion',
}), 'publicacion oficial no encontrada');

const service = createOfficialRewardService(serviceOptions());
const before = JSON.stringify(players);
rejected(() => service.settle({
  testId: validTest, attemptId, officialAttemptId, rankingPublicationId: id(),
  eventId: id(), actor: 'admin', reason: 'id incorrecto',
}), 'publicacion oficial no encontrada');
assert.equal(JSON.stringify(players), before, 'un rechazo no debe modificar al alumno');

const first = service.settle({ testId: validTest, attemptId, officialAttemptId, rankingPublicationId: publicationId,
  eventId, actor: 'admin', reason: 'resultado oficial publicado' });
assert.equal(first.duplicate, false);
assert.equal(first.settlement.status, 'completed');
assert.equal(first.settlement.rewardSettlementId.length, 36);
assert.equal(first.settlement.testId, validTest);
assert.equal(first.settlement.rankingPublicationId, publicationId);
const balance = player.aureos;
const xp = player.experiencia;
const streak = JSON.stringify(player.dailyStreak);
const achievements = JSON.stringify(player.achievements);
assert(balance > 10 && xp > 0 && player.officialRewardLedger.length >= 2);

const repeated = service.settle({ testId: validTest, attemptId, officialAttemptId, rankingPublicationId: publicationId,
  eventId, actor: 'admin', reason: 'resultado oficial publicado' });
assert.equal(repeated.duplicate, true);
assert.deepEqual(repeated.settlement, first.settlement);
const equivalent = service.settle({ testId: validTest, attemptId, officialAttemptId, rankingPublicationId: publicationId,
  eventId: id(), actor: 'admin', reason: 'reintento equivalente' });
assert.equal(equivalent.duplicate, false);
assert.equal(equivalent.settlement.rewardSettlementId, first.settlement.rewardSettlementId);
assert.equal(player.aureos, balance);
assert.equal(player.experiencia, xp);
assert.equal(JSON.stringify(player.dailyStreak), streak);
assert.equal(JSON.stringify(player.achievements), achievements);

rejected(() => service.settle({ testId: validTest, attemptId, officialAttemptId, rankingPublicationId: publicationId,
  eventId, actor: 'admin', reason: 'motivo contradictorio' }), 'eventId contradictorio');
for (const [field, value] of [
  ['testId', id()], ['attemptId', id()], ['officialAttemptId', id()], ['rankingPublicationId', id()],
]) {
  rejected(() => service.settle({ testId: field === 'testId' ? value : validTest,
    attemptId: field === 'attemptId' ? value : attemptId,
    officialAttemptId: field === 'officialAttemptId' ? value : officialAttemptId,
    rankingPublicationId: field === 'rankingPublicationId' ? value : publicationId,
    eventId, actor: 'admin', reason: 'resultado oficial publicado' }), 'eventId contradictorio');
}
rejected(() => service.settle({ testId: validTest, attemptId, officialAttemptId, rankingPublicationId: publicationId,
  accountPlayerId: playerId, eventId, actor: 'admin', reason: 'resultado oficial publicado' }), 'eventId contradictorio');
rejected(() => service.settle({ testId: validTest, attemptId, officialAttemptId, rankingPublicationId: publicationId,
  eventId, actor: 'admin', reason: 'resultado oficial publicado', rewardConfig: { aureosMultiplier: 99 } }), 'eventId contradictorio');
const concurrentResults = [
  service.settle({ testId: validTest, attemptId, officialAttemptId, rankingPublicationId: publicationId, eventId: id(), actor: 'admin', reason: 'concurrencia' }),
  service.settle({ testId: validTest, attemptId, officialAttemptId, rankingPublicationId: publicationId, eventId: id(), actor: 'admin', reason: 'concurrencia' }),
];
assert(concurrentResults.every(value => value.settlement.rewardSettlementId === first.settlement.rewardSettlementId), 'concurrencia duplico la liquidacion');

// Una caída al guardar deja la liquidación pendiente; al reiniciar se recupera sin duplicar.
const recoveryRoot = JSON.parse(JSON.stringify(root));
recoveryRoot.rewardSettlements = [];
recoveryRoot.events = [];
let recoveryPlayers = [{ ...player, aureos: 0, experiencia: 0, officialRewardLedger: [] }];
let recoveryFail = true;
const recovery = createOfficialRewardService({ ...serviceOptions(), root: recoveryRoot,
  loadPlayers: () => recoveryPlayers,
  savePlayers: value => { if (recoveryFail) { recoveryFail = false; throw Error('fallo controlado'); } recoveryPlayers = value; },
});
assert.throws(() => recovery.settle({ testId: validTest, attemptId, officialAttemptId, rankingPublicationId: publicationId,
  eventId: id(), actor: 'admin', reason: 'recuperacion' }), /fallo controlado/);
assert.equal(recoveryRoot.rewardSettlements[0].status, 'pending');
const pendingSettlementId = recoveryRoot.rewardSettlements[0].rewardSettlementId;
const pendingEventId = recoveryRoot.rewardSettlements[0].eventId;
const recovered = recovery.settle({ testId: validTest, attemptId, officialAttemptId, rankingPublicationId: publicationId,
  eventId: pendingEventId, actor: 'admin', reason: 'recuperacion' });
assert.equal(recovered.settlement.status, 'completed');
assert.equal(recovered.settlement.rewardSettlementId, pendingSettlementId);
assert.equal(recoveryRoot.rewardSettlements.length, 1, 'la recuperacion no debe crear otra liquidacion');
const recoveredBalance = recoveryPlayers[0].aureos;
const afterRecovery = createOfficialRewardService({ ...serviceOptions(), root: recoveryRoot,
  loadPlayers: () => recoveryPlayers, savePlayers: value => { recoveryPlayers = value; } });
assert.equal(afterRecovery.settle({ testId: validTest, attemptId, officialAttemptId, rankingPublicationId: publicationId,
  eventId: pendingEventId, actor: 'admin', reason: 'recuperacion' }).settlement.status, 'completed');
assert.equal(recoveryPlayers[0].aureos, recoveredBalance);
assert.equal(recoveryRoot.rewardSettlements[0].rewardSettlementId, pendingSettlementId);
assert.equal(recoveryRoot.events.filter(item => item.eventId === pendingEventId).length, 1, 'no debe duplicar auditoria');

// El servicio oficial no altera la contabilidad normal de partidas.
assert.equal(player.gamesPlayed, 7);
assert(calculateGameRewards(record, { hasPlayer: true }).earnedAureos >= 0);
assert(logs.every(item => !String(item.reason).includes('password')));
console.log('OK official reward service: validacion, idempotencia, concurrencia, recuperacion y aislamiento normal');
