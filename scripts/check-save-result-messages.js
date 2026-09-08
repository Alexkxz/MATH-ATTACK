'use strict';

const assert = require('assert');
const { createSessionStore } = require('../src/server/sessionStore');
const { createSaveResultMessages } = require('../src/server/ws/saveResultMessages');
const { createResultIdempotency } = require('../src/server/ws/resultIdempotency');

const sessionStore = createSessionStore();
const players = [{ accountPlayerId: 'acct-1', name: 'Ana Exacta', grade: '3', aureos: 1, experiencia: 0, dailyStreak: {} }];
const ranking = [];
const savedPlayers = [];
const sent = [];
const logs = [];
const examFinished = new Map();
const ws = { playerId: 'session-1', _uid: 'session-1', roomId: null, readyState: 1, playerName: 'Ana Exacta' };
const context = {
  gameSessions: sessionStore,
  maestroClients: new Set(),
  examFinished,
  getExamMode: () => null,
  identity: {
    getAccountPlayerId: message => message.accountPlayerId,
    resolveAccountPlayer: (items, query) => items.find(player => player.accountPlayerId === query.accountPlayerId || player.name.toLowerCase() === query.name.toLowerCase()),
    getSessionId: socket => socket._uid || socket.playerId,
  },
  persistence: {
    loadRanking: () => ranking,
    saveRanking: value => { ranking.splice(0, ranking.length, ...value); },
    loadPlayers: () => players,
    savePlayers: value => { savedPlayers.push(value); },
  },
};
const messageHandler = createSaveResultMessages({
  wsContext: context,
  WebSocket: { OPEN: 1 },
  multiplayerRewards: { _mpEarnedByGame: new Map() },
  buildCompletedResultRecord: (message, options) => ({ ...message, ...options, complete: true }),
  upsertCompletedResult: (items, record) => [...items.filter(item => item.id !== record.id), record],
  calculateGameRewards: () => ({ earnedAureos: 4, earnedExperience: 4, varietyMult: 1, tableHistoryChanged: false }),
  ensurePlayerExperience: player => player.experiencia || 0,
  logAureosTx: (player, amount, reason) => logs.push({ player, amount, reason }),
  calculateDailyStreak: () => ({ dailyStreak: { current: 1 }, bonus: 0 }),
  checkNewAchievements: () => [],
  ACHIEVEMENTS_DEF: [],
  send: (socket, payload) => sent.push({ socket, payload }),
  L: { rank: message => logs.push(message) },
  resultIdempotency: createResultIdempotency(),
});

sessionStore.createSession('session-1', { name: 'Ana Exacta', ws });
messageHandler.handleSaveResult(ws, { type: 'save_result', id: 'game-1', name: 'ana exacta', accountPlayerId: 'acct-1', score: 10 });
assert.strictEqual(ranking.length, 1);
assert.strictEqual(ranking[0].canonicalName, 'Ana Exacta');
assert.strictEqual(players[0].aureos, 5);
assert.strictEqual(savedPlayers.length, 1);
assert.strictEqual(sessionStore.getSession('session-1'), undefined);

messageHandler.handleSaveResult({ ...ws, playerId: 'legacy', _uid: 'legacy', playerName: 'Legacy' }, { type: 'save_result', id: 'game-2', name: 'Legacy', score: 5 });
assert.strictEqual(ranking.length, 2);
assert.strictEqual(sent.length, 2);
const aureosAfterFirstSave = players[0].aureos;
const savedPlayersAfterFirstSave = savedPlayers.length;
assert.strictEqual(messageHandler.handleSaveResult(ws, { type: 'save_result', id: 'game-1', name: 'Ana Exacta', accountPlayerId: 'acct-1', score: 10 }), false);
assert.strictEqual(players[0].aureos, aureosAfterFirstSave);
assert.strictEqual(savedPlayers.length, savedPlayersAfterFirstSave);
assert.strictEqual(sent.length, 2);
console.log('OK: save_result conserva ranking, cuenta, recompensas, notificacion, legado y limpieza de sesion.');
