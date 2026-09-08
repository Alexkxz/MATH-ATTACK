'use strict';

const assert = require('assert');
const { createEconomyContext } = require('../src/server/ws/economyContext');

const rooms = new Map();
const gameSessions = { listSessions: () => [] };
const awardedPotGames = new Set();
const awardedBonusGames = new Set();
const mpEarnedByGame = new Map();
const pendingPotMsgs = new Map();
const sendOrQueueMsg = () => {};
const send = () => {};
const context = createEconomyContext({
  rooms,
  gameSessions,
  _awardedPotGames: awardedPotGames,
  _awardedBonusGames: awardedBonusGames,
  _mpEarnedByGame: mpEarnedByGame,
  pendingPotMsgs,
  sendOrQueueMsg,
  persistence: { loadPlayers: true, savePlayers: true },
  identity: { playerId: true },
  send,
  broadcasts: { panel: true, rankingLive: true },
});

assert.strictEqual(context.rooms, rooms);
assert.strictEqual(context.gameSessions, gameSessions);
assert.strictEqual(context._awardedPotGames, awardedPotGames);
assert.strictEqual(context._awardedBonusGames, awardedBonusGames);
assert.strictEqual(context._mpEarnedByGame, mpEarnedByGame);
assert.strictEqual(context.pendingPotMsgs, pendingPotMsgs);
assert.strictEqual(context.sendOrQueueMsg, sendOrQueueMsg);
assert.strictEqual(context.send, send);
rooms.set('room-a', {});
mpEarnedByGame.set('game-a', 4);
assert.strictEqual(context.rooms.has('room-a'), true);
assert.strictEqual(context._mpEarnedByGame.get('game-a'), 4);
assert.strictEqual(context.persistence.savePlayers, true);
assert.strictEqual(context.identity.playerId, true);
assert.strictEqual(context.broadcasts.panel, true);
console.log('OK: economyContext conserva referencias economicas sin reinicializar ni duplicar estado.');
