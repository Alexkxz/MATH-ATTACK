'use strict';

const assert = require('node:assert/strict');
const { createMaestroAnnouncementMessages } = require('../src/server/ws/maestroAnnouncementMessages');

const OPEN = 1;
const sent = [];
const logs = [];
const openWs = { id: 'open', readyState: OPEN };
const closedWs = { id: 'closed', readyState: 0 };
const sessions = [
  { name: 'Ana', ws: openWs },
  { name: 'Beto', ws: closedWs },
  { name: 'Carla' },
];
const messages = createMaestroAnnouncementMessages({
  ADMIN_PASSWORD: 'secret',
  gameSessions: { listSessions: () => sessions },
  send: (ws, message) => sent.push({ ws, message }),
  L: { panel: message => logs.push(message) },
  WebSocket: { OPEN },
});
const panelWs = { id: 'panel' };

assert.equal(messages.handleMaestroAnnouncement(panelWs, {
  type: 'maestro_announcement', text: 'Aviso importante', password: 'secret',
}), true);
assert.deepEqual(sent, [{ ws: openWs, message: { type: 'announcement', text: 'Aviso importante' } }]);
assert.deepEqual(logs, ['Anuncio maestro: \"Aviso importante\"']);

const before = { sent: sent.length, logs: logs.length };
for (const message of [
  { type: 'maestro_announcement', text: 'No', password: 'wrong' },
  { type: 'maestro_announcement', text: 'No' },
  { type: 'maestro_announcement', text: '', password: 'secret' },
  { type: 'maestro_announcement', password: 'secret' },
]) {
  assert.equal(messages.handleMaestroAnnouncement(panelWs, message), false);
}
assert.deepEqual({ sent: sent.length, logs: logs.length }, before);

const longText = 'x'.repeat(350);
assert.equal(messages.handleMaestroAnnouncement(panelWs, {
  type: 'maestro_announcement', text: longText, password: 'secret',
}), true);
assert.equal(sent[1].message.type, 'announcement');
assert.equal(sent[1].message.text.length, 300);
assert.equal(sent[1].message.text, longText.slice(0, 300));
assert.equal(logs[1], `Anuncio maestro: \"${longText.slice(0, 300)}\"`);
assert.equal(sent.some(item => item.ws === closedWs), false);

assert.equal(messages.handleMaestroAnnouncement(panelWs, { type: 'kick_player', playerId: 'Ana', password: 'secret' }), false);
assert.equal(messages.handleMaestroAnnouncement(panelWs, { type: 'panel_state' }), false);
assert.equal(messages.handleMaestroAnnouncement(panelWs, { type: 'exam_state' }), false);
assert.equal(messages.handleMaestroAnnouncement(panelWs, { type: 'conn_event' }), false);
assert.equal(messages.handleMaestroAnnouncement(panelWs, { type: 'students_updated' }), false);
assert.equal(messages.handleMaestroAnnouncement(panelWs, { type: 'game_msg', data: {} }), false);

console.log('check-maestro-announcement-messages: OK');
