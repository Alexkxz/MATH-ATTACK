'use strict';

const assert = require('assert');
const { createSessionStore } = require('../src/server/sessionStore');

const expired = [];
const store = createSessionStore({ reconnectWindowMs: 15_000, onExpire: (_session, id) => expired.push(id) });
const session = store.createSession('session-a', {
  accountPlayerId: 'account-a',
  connectionId: 7,
  name: 'Ana',
  gameMode: 'solo',
});
assert.strictEqual(store.getSession('session-a'), session);
assert.strictEqual(store.getSession('account-a'), undefined, 'accountPlayerId no es clave de sesión');
assert.strictEqual(store.getSession('connection-7'), undefined, 'connectionId no es clave persistente');

assert.strictEqual(store.updateSession('session-a', { score: 42 }).score, 42);
assert.strictEqual(store.listSessions().length, 1);

const disconnectedAt = 1_000_000;
assert.strictEqual(store.markDisconnected('session-a', disconnectedAt), session);
assert.strictEqual(session.disconnected, true);
assert.strictEqual(session.ws, null);
assert.strictEqual(store.restoreSession('ANA', { readyState: 1 }), session);
assert.strictEqual(session.disconnected, false);
assert.strictEqual(session.ws.readyState, 1);

store.markDisconnected('session-a', disconnectedAt);
assert.strictEqual(store.cleanupExpiredSessions(disconnectedAt + 14_999), 0);
assert.strictEqual(store.getSession('session-a'), session);
assert.strictEqual(store.cleanupExpiredSessions(disconnectedAt + 15_000), 1);
assert.strictEqual(store.getSession('session-a'), undefined);
assert.deepStrictEqual(expired, ['session-a']);

const legacyStore = createSessionStore();
const legacySession = legacyStore.createSession('session-legacy', { name: 'Legado' });
assert.strictEqual(legacyStore.restoreSession('legado', {}), undefined);
assert.strictEqual(legacyStore.updateSession('session-legacy', { accountPlayerId: null }).name, 'Legado');
assert.strictEqual(legacyStore.removeSession('session-legacy'), true);
assert.strictEqual(legacyStore.removeSession('session-legacy'), false);

console.log('OK: sessionStore crea, actualiza, restaura, expira y elimina sesiones sin confundir identidades.');
