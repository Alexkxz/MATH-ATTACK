'use strict';

const assert = require('assert');
const {
  getAccountPlayerId,
  resolveAccountPlayer,
  getSessionId,
  getExternalPlayerId,
  findActiveSession,
  getConnectionId,
  findConnectionById,
} = require('../src/identity');

const account = { id: 'account-a', name: 'Ana', pin: '1234' };
const players = [account, { id: 'account-b', name: 'Beto', pin: '5678' }];

// La cuenta usa el ID persistente y conserva el alias público playerId.
assert.strictEqual(getAccountPlayerId({ accountPlayerId: 'account-a', playerId: 'legacy-a' }), 'account-a');
assert.strictEqual(getAccountPlayerId({ playerId: 'account-a' }), 'account-a');
assert.strictEqual(resolveAccountPlayer(players, { accountPlayerId: 'account-a', name: 'ANA' }), account);
assert.strictEqual(resolveAccountPlayer(players, { playerId: 'account-a', name: 'ANA' }), account);
assert.strictEqual(resolveAccountPlayer(players, { accountPlayerId: 'wrong', name: 'Ana' }), undefined);

// Un jugador legado sigue resolviéndose por nombre cuando no tiene ID.
const legacy = { name: 'Legado', pin: '1111' };
assert.strictEqual(resolveAccountPlayer([legacy], { playerId: null, name: 'LEGADO' }), legacy);
assert.strictEqual(resolveAccountPlayer([legacy], { name: '' }), undefined);

// La sesión sólo se obtiene del identificador efímero de la conexión.
const sessionConnection = { playerId: 'session-a', _uid: 'uid-a' };
assert.strictEqual(getSessionId(sessionConnection), 'session-a');
assert.strictEqual(getExternalPlayerId(sessionConnection), 'session-a');
const sessions = new Map([['session-a', { id: 'session-a', name: 'Ana' }]]);
assert.strictEqual(findActiveSession(sessions, 'session-a').name, 'Ana');
assert.strictEqual(findActiveSession(sessions, 'account-a'), undefined);

// El connectionId sólo identifica la conexión WebSocket concreta.
const connectionA = { _connId: 7 };
const connectionB = { _connId: 8 };
assert.strictEqual(getConnectionId(connectionA), 7);
assert.strictEqual(findConnectionById([connectionA, connectionB], 7), connectionA);
assert.strictEqual(findConnectionById([connectionA, connectionB], '7'), undefined);
assert.notStrictEqual(getConnectionId(connectionA), getConnectionId(connectionB));

console.log('OK: identidad distingue cuenta persistente, sesión efímera, conexión y alias playerId.');
