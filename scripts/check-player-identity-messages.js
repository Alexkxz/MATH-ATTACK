'use strict';

const assert = require('assert');
const { createSessionStore } = require('../src/server/sessionStore');
const { createPlayerIdentityMessages } = require('../src/server/ws/playerIdentityMessages');

const sessions = createSessionStore();
const wsContext = {
  gameSessions: sessions,
  identity: {
    getSessionId: ws => ws._uid || ws.playerId || null,
    findActiveSession: (store, id) => store.getSession(id),
  },
};
const examNotices = [];
const pending = [];
let broadcasts = 0;
let ids = 0;
const messages = createPlayerIdentityMessages({
  wsContext,
  genId: () => `LEGACY-${++ids}`,
  checkExamNotify: (ws, grade) => examNotices.push({ ws, grade }),
  deliverPendingPotMsg: session => pending.push(session),
  schedulePanelBroadcast: () => { broadcasts++; },
});

const newWs = { playerId: null };
assert.strictEqual(messages.handle(newWs, { type: 'player_identify', name: 'Ana', grade: '3' }), true);
assert.strictEqual(newWs.playerId, 'LEGACY-1');
const identified = sessions.getSession('LEGACY-1');
assert.strictEqual(identified.name, 'Ana');
assert.strictEqual(identified.gameMode, 'idle');
assert.strictEqual(identified.ws, newWs);

assert.strictEqual(messages.handle(newWs, {
  type: 'session_update', name: 'Ana', grade: '3', gameMode: 'solo', score: 12,
}), true);
assert.strictEqual(identified.score, 12);
assert.strictEqual(identified.status, 'playing');
assert.strictEqual(identified.id, 'LEGACY-1');
assert.strictEqual(broadcasts, 1);

const disconnectedWs = { playerId: null };
sessions.markDisconnected('LEGACY-1');
assert.strictEqual(messages.handle(disconnectedWs, { type: 'player_identify', name: 'Ana' }), true);
assert.strictEqual(disconnectedWs.playerId, 'LEGACY-1');
assert.strictEqual(sessions.getSession('LEGACY-1').ws, disconnectedWs);
assert.strictEqual(sessions.getSession('LEGACY-1').disconnected, false);

const legacyWs = { playerId: null };
assert.strictEqual(messages.handle(legacyWs, { type: 'player_identify' }), true);
assert.strictEqual(legacyWs.playerId, 'LEGACY-2');
assert.strictEqual(sessions.getSession('LEGACY-2').name, '?');
assert.strictEqual(messages.handle(legacyWs, { type: 'other_message' }), false);
assert.ok(examNotices.length >= 3);
assert.ok(pending.length >= 3);
console.log('OK: player_identify y session_update conservan sesiones, legado, reconexion y broadcast.');
