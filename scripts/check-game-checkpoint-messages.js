'use strict';

const assert = require('assert');
const { createSessionStore } = require('../src/server/sessionStore');
const { handleGameCheckpoint } = require('../src/server/ws/gameCheckpointMessages');

const sessionStore = createSessionStore();
const wsContext = { gameSessions: sessionStore };
const ws = { playerId: 'legacy-player', _uid: 'legacy-player' };
const persisted = [];
const players = [{ accountPlayerId: 'acct-1', name: 'Ana Exacta' }];
const dependencies = {
  ws,
  wsContext,
  sessionStore,
  identity: {
    getAccountPlayerId: message => message.accountPlayerId,
    resolveAccountPlayer: (items, query) => items.find(player =>
      (query.accountPlayerId && player.accountPlayerId === query.accountPlayerId) ||
      player.name.toLowerCase() === query.name.toLowerCase()),
  },
  persistence: { loadPlayers: () => players },
  ranking: { persistCheckpoint: (message, canonicalName) => persisted.push({ message, canonicalName }) },
};

assert.strictEqual(handleGameCheckpoint({ ...dependencies, message: { type: 'game_checkpoint', id: 'g1', name: 'ana', accountPlayerId: 'acct-1' } }), true);
assert.strictEqual(persisted[0].canonicalName, 'Ana Exacta');

assert.strictEqual(handleGameCheckpoint({ ...dependencies, message: { type: 'game_checkpoint', id: 'g2' } }), false);
assert.strictEqual(persisted.length, 1);

assert.strictEqual(handleGameCheckpoint({ ...dependencies, message: { type: 'game_checkpoint', id: 'g3', name: 'Legado' } }), true);
assert.strictEqual(persisted[1].canonicalName, 'Legado');

assert.strictEqual(handleGameCheckpoint({ ...dependencies, message: { type: 'game_checkpoint', id: 'g4', name: 'Ana', accountPlayerId: 'unknown' } }), true);
assert.strictEqual(persisted[2].canonicalName, 'Ana');
assert.strictEqual(persisted.length, 3);
console.log('OK: game_checkpoint conserva validacion, identidad persistente, legado y persistencia unica.');
