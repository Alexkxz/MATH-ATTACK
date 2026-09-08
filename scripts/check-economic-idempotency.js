'use strict';

const assert = require('node:assert/strict');
const { createResultIdempotency } = require('../src/server/ws/resultIdempotency');
const { createPotDeductMessages } = require('../src/server/ws/potDeductMessages');
const { createPotAwardMessages } = require('../src/server/ws/potAwardMessages');
const { createPotDrawMessages } = require('../src/server/ws/potDrawMessages');
const { createMpWinnerBonusMessages } = require('../src/server/ws/mpWinnerBonusMessages');
const { createSaveResultMessages } = require('../src/server/ws/saveResultMessages');
const { createEconomicIdempotency } = require('../src/server/ws/economicIdempotency');

function snapshot(state) {
  return {
    players: state.players.map(player => ({ name: player.name, aureos: player.aureos, experiencia: player.experiencia })),
    ranking: state.ranking.map(item => item.id),
    transactions: state.transactions.length,
    notifications: state.notifications.length,
    savedPlayers: state.savedPlayers.length,
    dedupe: {
      pot: [...state.awardedPotGames],
      bonus: [...state.awardedBonusGames],
      earned: [...state.mpEarnedByGame.keys()],
      results: state.resultIdempotency ? [state.resultIdempotency.hasProcessedResult('result-1')] : [],
    },
  };
}

function report(label, initial, message, final, retry) {
  console.log(`AUDIT ${label}: ${JSON.stringify({ initial, message, final, retry })}`);
}

function makeEconomyState(players) {
  const state = {
    players,
    ranking: [],
    transactions: [],
    notifications: [],
    savedPlayers: [],
    awardedPotGames: new Set(),
    awardedBonusGames: new Set(),
    mpEarnedByGame: new Map(),
  };
  state.economy = {
    _awardedPotGames: state.awardedPotGames,
    _awardedBonusGames: state.awardedBonusGames,
    _mpEarnedByGame: state.mpEarnedByGame,
    idempotency: createEconomicIdempotency(),
    persistence: {
      loadPlayers: () => state.players,
      savePlayers: value => { state.savedPlayers.push(value.map(player => ({ ...player }))); },
    },
    sendOrQueueMsg: (name, message) => state.notifications.push({ name, message }),
    send: (ws, message) => state.notifications.push({ ws, message }),
  };
  state.context = { economy: state.economy };
  return state;
}

function findPlayer(players, name) {
  return players.find(player => player.name.toLowerCase() === String(name).toLowerCase());
}

function makeCommon(state) {
  return {
    wsContext: state.context,
    findPlayerByName: findPlayer,
    ensurePlayerExperience: player => {
      if (typeof player.experiencia !== 'number') player.experiencia = 0;
      return player.experiencia;
    },
    logAureosTx: (player, amount, reason) => state.transactions.push({ name: player.name, amount, reason }),
    L: { game: message => state.transactions.push({ message }) },
  };
}

const state = makeEconomyState([
  { name: 'Ana', aureos: 10, experiencia: 20 },
  { name: 'Legacy', aureos: 4 },
]);
const ws = roomId => ({ roomId, playerName: 'Ana', readyState: 1 });
const potAward = createPotAwardMessages(makeCommon(state));
const potDraw = createPotDrawMessages(makeCommon(state));
const bonus = createMpWinnerBonusMessages(makeCommon(state));

let initial = snapshot(state);
let message = { gameId: 'award-1', winnerName: 'Missing', amount: 5, losers: ['Ana'] };
let result = potAward.handlePotAward(ws('room-award'), message);
let final = snapshot(state);
assert.equal(result, false);
assert.deepEqual(final.players, initial.players);
assert.equal(state.awardedPotGames.has('room-award_award-1'), false);
report('pot_award ganador inexistente', initial, message, final, 'no marcado; sin efectos');

initial = snapshot(state);
message = { gameId: 'award-1', winnerName: 'Ana', amount: 5, losers: [] };
result = potAward.handlePotAward(ws('room-award'), message);
final = snapshot(state);
assert.equal(result, true);
assert.equal(state.players[0].aureos, 15);
assert(state.awardedPotGames.has('room-award_award-1'));
report('pot_award reintento ganador valido', initial, message, final, 'procesado');

initial = snapshot(state);
result = potAward.handlePotAward(ws('room-award'), message);
final = snapshot(state);
assert.equal(result, false);
assert.equal(state.players[0].aureos, 15);
report('pot_award repetido tras liquidacion', initial, message, final, 'bloqueado');

initial = snapshot(state);
message = { gameId: 'draw-1', betAmount: 0, names: ['Ana'] };
result = potDraw.handlePotDraw(ws('room-draw'), message);
final = snapshot(state);
assert.equal(result, false);
assert.equal(state.awardedPotGames.has('room-draw_draw-1'), false);
report('pot_draw betAmount invalido', initial, message, final, 'no marcado; sin reembolso');

initial = snapshot(state);
message = { gameId: 'draw-2', betAmount: 3, names: [] };
result = potDraw.handlePotDraw(ws('room-draw'), message);
final = snapshot(state);
assert.equal(result, false);
assert.equal(state.awardedPotGames.has('room-draw_draw-2'), false);
report('pot_draw names vacio', initial, message, final, 'no marcado; sin reembolso');

initial = snapshot(state);
message = { gameId: 'draw-1', betAmount: 3, names: ['Ana'] };
result = potDraw.handlePotDraw(ws('room-draw'), message);
final = snapshot(state);
assert.equal(result, true);
assert.equal(state.players[0].aureos, 18);
assert(state.awardedPotGames.has('room-draw_draw-1'));
report('pot_draw reintento posterior valido', initial, message, final, 'procesado');

initial = snapshot(state);
message = { gameId: 'draw-missing', betAmount: 2, names: ['Ana', 'Missing'] };
result = potDraw.handlePotDraw(ws('room-draw'), message);
final = snapshot(state);
assert.equal(result, false);
assert.equal(state.awardedPotGames.has('room-draw_draw-missing'), false);
assert.equal(state.players[0].aureos, 18);
report('pot_draw jugador inexistente', initial, message, final, 'no marcado; sin reembolso parcial');

initial = snapshot(state);
message = { gameId: 'bonus-before-save', winners: ['Ana'] };
result = bonus.handleMpWinnerBonus(ws('room-bonus'), message);
final = snapshot(state);
assert.equal(result, false);
assert.equal(state.players[0].aureos, 18);
assert.equal(state.awardedBonusGames.has('room-bonus_bonus-before-save_bonus'), false);
report('mp_winner_bonus antes de save_result', initial, message, final, 'no marcado; espera earnedKey');

state.mpEarnedByGame.set('room-bonus_bonus-before-save_ana', 4);
initial = snapshot(state);
result = bonus.handleMpWinnerBonus(ws('room-bonus'), message);
final = snapshot(state);
assert.equal(result, true);
assert.equal(state.players[0].aureos, 22);
assert.equal(state.mpEarnedByGame.has('room-bonus_bonus-before-save_ana'), false);
assert(state.awardedBonusGames.has('room-bonus_bonus-before-save_bonus'));
report('mp_winner_bonus reintento posterior a save_result', initial, message, final, 'procesado');

initial = snapshot(state);
result = bonus.handleMpWinnerBonus(ws('room-bonus'), message);
final = snapshot(state);
assert.equal(result, false);
assert.equal(state.players[0].aureos, 22);
report('mp_winner_bonus repetido tras liquidacion', initial, message, final, 'bloqueado');

initial = snapshot(state);
message = { gameId: 'bonus-missing', winners: ['Missing'] };
state.mpEarnedByGame.set('room-bonus2_bonus-missing_missing', 6);
result = bonus.handleMpWinnerBonus(ws('room-bonus2'), message);
final = snapshot(state);
assert.equal(result, false);
assert.equal(state.awardedBonusGames.has('room-bonus2_bonus-missing_bonus'), false);
assert(state.mpEarnedByGame.has('room-bonus2_bonus-missing_missing'));
report('mp_winner_bonus jugador inexistente', initial, message, final, 'no marcado; earnedKey queda pendiente');

state.mpEarnedByGame.set('room-bonus2_bonus-missing_ana', 6);
initial = snapshot(state);
result = bonus.handleMpWinnerBonus(ws('room-bonus2'), { gameId: 'bonus-missing', winners: ['Ana'] });
final = snapshot(state);
assert.equal(result, true);
assert.equal(state.players[0].aureos, 28);
assert.equal(state.mpEarnedByGame.has('room-bonus2_bonus-missing_ana'), false);
report('mp_winner_bonus reintento jugador valido', initial, message, final, 'procesado');

const failureState = makeEconomyState([{ name: 'Ana', aureos: 10, experiencia: 1 }]);
let failSave = true;
failureState.economy.persistence.savePlayers = value => {
  if (failSave) {
    failSave = false;
    throw new Error('persistencia controlada');
  }
  failureState.savedPlayers.push(value.map(player => ({ ...player })));
};
const failureAward = createPotAwardMessages(makeCommon(failureState));
initial = snapshot(failureState);
message = { gameId: 'failure-award', winnerName: 'Ana', amount: 4, losers: [] };
assert.throws(() => failureAward.handlePotAward(ws('room-failure'), message), /persistencia controlada/);
final = snapshot(failureState);
assert.equal(failureState.players[0].aureos, 10);
assert.equal(failureState.awardedPotGames.has('room-failure_failure-award'), false);
assert.equal(failureState.transactions.length, 0);
report('pot_award error antes de persistencia', initial, message, final, 'rollback; reintento disponible');
assert.equal(failureAward.handlePotAward(ws('room-failure'), message), true);
assert.equal(failureState.players[0].aureos, 14);

const deductFailureState = makeEconomyState([{ name: 'Ana', aureos: 10, experiencia: 0 }]);
let failDeductSave = true;
deductFailureState.economy.persistence.savePlayers = value => {
  if (failDeductSave) {
    failDeductSave = false;
    throw new Error('persistencia controlada');
  }
  deductFailureState.savedPlayers.push(value.map(player => ({ ...player })));
};
const failureDeduct = createPotDeductMessages(makeCommon(deductFailureState));
const failureDeductMessage = { id: 'deduct-retry', amount: 4 };
initial = snapshot(deductFailureState);
assert.throws(() => failureDeduct.handlePotDeduct({ playerName: 'Ana' }, failureDeductMessage), /persistencia controlada/);
assert.equal(deductFailureState.players[0].aureos, 10);
assert.equal(deductFailureState.economy.idempotency.hasPotDeductId('deduct-retry'), false);
assert.equal(failureDeduct.handlePotDeduct({ playerName: 'Ana' }, failureDeductMessage), true);
final = snapshot(deductFailureState);
assert.equal(deductFailureState.players[0].aureos, 6);
assert.equal(deductFailureState.economy.idempotency.hasPotDeductId('deduct-retry'), true);
report('pot_deduct error antes de persistencia', initial, failureDeductMessage, final, 'rollback; reintento procesado una vez');

const deductState = makeEconomyState([{ name: 'Ana', aureos: 10, experiencia: 0 }]);
const deduct = createPotDeductMessages({
  ...makeCommon(deductState),
  L: { game: message => deductState.transactions.push({ message }) },
});
const deductMessage = { amount: 3 };
initial = snapshot(deductState);
assert.equal(deduct.handlePotDeduct({ playerName: 'Ana' }, deductMessage), true);
const afterFirstDeduct = snapshot(deductState);
assert.equal(deduct.handlePotDeduct({ playerName: 'Ana' }, deductMessage), true);
final = snapshot(deductState);
assert.equal(deductState.players[0].aureos, 4);
assert.equal(deductState.transactions.filter(item => item.reason === 'apuesta_jugada').length, 2);
assert.equal(deductState.notifications.filter(item => item.message.type === 'pot_deduct_result').length, 2);
report('pot_deduct mensaje repetido', initial, deductMessage, final, 'se procesa dos veces; sin deduplicacion');
assert.notDeepEqual(afterFirstDeduct, final);

const saveState = makeEconomyState([{ accountPlayerId: 'acct-1', name: 'Ana', aureos: 0, experiencia: 0, gamesPlayed: 0 }]);
saveState.ranking = [];
saveState.resultIdempotency = createResultIdempotency();
const saveContext = {
  gameSessions: { removeSession() {} },
  maestroClients: new Set(),
  examFinished: new Map(),
  identity: {
    getAccountPlayerId: message => message.accountPlayerId,
    resolveAccountPlayer: (players, query) => players.find(player => player.accountPlayerId === query.accountPlayerId),
    getSessionId: wsValue => wsValue.playerId,
  },
  persistence: {
    loadRanking: () => saveState.ranking,
    saveRanking: value => { saveState.ranking = value; },
    loadPlayers: () => saveState.players,
    savePlayers: value => { saveState.savedPlayers.push(value.map(player => ({ ...player }))); },
  },
  getExamMode: () => null,
};
const save = createSaveResultMessages({
  wsContext: saveContext,
  WebSocket: { OPEN: 1 },
  multiplayerRewards: { _mpEarnedByGame: saveState.mpEarnedByGame },
  buildCompletedResultRecord: (value, options) => ({ ...value, ...options, id: value.id, complete: true }),
  upsertCompletedResult: (items, record) => [...items.filter(item => item.id !== record.id), record],
  calculateGameRewards: () => ({ earnedAureos: 4, earnedExperience: 4, varietyMult: 1, tableHistoryChanged: false }),
  ensurePlayerExperience: player => player.experiencia || 0,
  logAureosTx: (player, amount, reason) => saveState.transactions.push({ name: player.name, amount, reason }),
  calculateDailyStreak: () => ({ dailyStreak: { current: 1 }, bonus: 0 }),
  checkNewAchievements: () => [],
  ACHIEVEMENTS_DEF: [],
  send: (socket, payload) => saveState.notifications.push({ socket, payload }),
  L: { rank: value => saveState.transactions.push({ message: value }) },
  resultIdempotency: saveState.resultIdempotency,
});
const saveWs = { playerId: 'session-1', roomId: 'room-save', readyState: 1, playerName: 'Ana' };
const saveMessage = { type: 'save_result', id: 'result-1', accountPlayerId: 'acct-1', name: 'Ana', gameId: 'game-save', gameMode: 'online', mpGameMode: 'duel', score: 10 };
initial = snapshot(saveState);
assert.equal(save.handleSaveResult(saveWs, saveMessage), true);
const afterFirstSave = snapshot(saveState);
assert.equal(saveState.mpEarnedByGame.get('room-save_game-save_ana'), 4);
assert.equal(save.handleSaveResult(saveWs, saveMessage), false);
final = snapshot(saveState);
assert.equal(saveState.players[0].aureos, 4);
assert.equal(saveState.players[0].experiencia, 4);
assert.equal(saveState.ranking.length, 1);
assert.equal(saveState.savedPlayers.length, 1);
assert.equal(saveState.notifications.length, 1);
report('save_result message.id repetido', initial, saveMessage, final, 'bloqueado por id; credito y earnedKey unicos');
assert.deepEqual(afterFirstSave, final);

console.log('check-economic-idempotency: OK (auditoria completada sin modificar produccion ni JSON)');
