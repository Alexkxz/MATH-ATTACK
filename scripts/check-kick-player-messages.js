'use strict';

const assert = require('node:assert/strict');
const { createKickPlayerMessages } = require('../src/server/ws/kickPlayerMessages');

const OPEN = 1;
const gameSessions = { id: 'sessions' };
const activeWs = { id: 'active', readyState: OPEN, terminate() { this.terminated = true; } };
const closedWs = { id: 'closed', readyState: 0, terminate() { this.terminated = true; } };
const activeSession = { name: 'Ana', ws: activeWs };
const closedSession = { name: 'Beto', ws: closedWs };
const sessions = new Map([
  ['session-active', activeSession],
  ['session-closed', closedSession],
]);
const sent = [];
const connEvents = [];
const logs = [];
const timers = [];
const messages = createKickPlayerMessages({
  ADMIN_PASSWORD: 'secret',
  gameSessions,
  findActiveSession: (store, playerId) => store === gameSessions ? sessions.get(playerId) : undefined,
  send: (ws, message) => sent.push({ ws, message }),
  pushConnLog: (type, message) => connEvents.push({ type, message }),
  L: { disc: message => logs.push(message) },
  WebSocket: { OPEN },
  scheduleTermination: (callback, delay) => timers.push({ callback, delay }),
});
const panelWs = { id: 'panel' };

assert.equal(messages.handleKickPlayer(panelWs, {
  type: 'kick_player', playerId: 'session-active', password: 'secret',
}), true);
assert.equal(activeWs._kicked, true);
assert.deepEqual(sent, [{
  ws: activeWs,
  message: { type: 'kicked', reason: 'El maestro te desconectó del juego.' },
}]);
assert.deepEqual(connEvents, [{ type: 'kick', message: '⚡ Maestro desconectó a Ana' }]);
assert.deepEqual(logs, ['Maestro desconectó forzosamente a Ana']);
assert.equal(timers.length, 1);
assert.equal(timers[0].delay, 150);
timers[0].callback();
assert.equal(activeWs.terminated, true);

const before = { sent: sent.length, events: connEvents.length, logs: logs.length, timers: timers.length };
const invalidMessages = [
  { type: 'kick_player', playerId: 'session-active', password: 'wrong' },
  { type: 'kick_player', playerId: 'session-active' },
  { type: 'kick_player', password: 'secret' },
  { type: 'kick_player', playerId: 'missing', password: 'secret' },
];
invalidMessages.forEach((message, index) => {
  assert.equal(messages.handleKickPlayer(panelWs, message), index === 3);
});
assert.deepEqual({ sent: sent.length, events: connEvents.length, logs: logs.length, timers: timers.length }, before);

assert.equal(messages.handleKickPlayer(panelWs, {
  type: 'kick_player', playerId: 'session-closed', password: 'secret',
}), true);
assert.equal(sent.length, before.sent);
assert.equal(timers.length, before.timers);

assert.equal(messages.handleKickPlayer(panelWs, { type: 'maestro_announcement', text: 'x', password: 'secret' }), false);
assert.equal(messages.handleKickPlayer(panelWs, { type: 'panel_state' }), false);
assert.equal(messages.handleKickPlayer(panelWs, { type: 'exam_state' }), false);
assert.equal(messages.handleKickPlayer(panelWs, { type: 'conn_event' }), false);
assert.equal(messages.handleKickPlayer(panelWs, { type: 'students_updated' }), false);
assert.equal(messages.handleKickPlayer(panelWs, { type: 'game_msg', data: {} }), false);

const room = { players: [{ ws: activeWs, name: 'Ana', idx: 0 }, { ws: { id: 'peer', readyState: OPEN }, name: 'Peer', idx: 1 }] };
assert.equal(room.players.length, 2);
assert.equal(activeWs._kicked, true);
console.log('check-kick-player-messages: OK');
