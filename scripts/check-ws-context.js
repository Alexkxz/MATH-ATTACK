'use strict';

const assert = require('assert');
const { createWsContext } = require('../src/server/ws/wsContext');

const gameSessions = { listSessions() { return []; } };
const rooms = new Map();
const maestroClients = new Set();
const rankingLiveClients = new Set();
const examFinished = new Map();
const heartbeatInterval = setInterval(() => {}, 60_000);
const examState = { value: { grade: '3' } };
const session = { _disconnectTimer: 'session-timer' };
const slot = { _disconnectTimer: 'room-timer' };
const room = { _emptyTimer: 'empty-timer' };

try {
  const context = createWsContext({
    gameSessions,
    rooms,
    maestroClients,
    rankingLiveClients,
    examFinished,
    getExamMode: () => examState.value,
    setExamMode: value => { examState.value = value; },
    timers: { heartbeatInterval, reconnectWindowMs: 15_000 },
    persistence: { saveResult: true },
    broadcasts: { panel: true },
    identity: { playerId: true },
    panelState: { build: true },
  });

  assert.strictEqual(context.gameSessions, gameSessions);
  assert.strictEqual(context.rooms, rooms);
  assert.strictEqual(context.maestroClients, maestroClients);
  assert.strictEqual(context.rankingLiveClients, rankingLiveClients);
  assert.strictEqual(context.examFinished, examFinished);
  assert.strictEqual(context.getExamMode(), examState.value);
  context.setExamMode(null);
  assert.strictEqual(examState.value, null);
  assert.strictEqual(context.timers.heartbeatInterval, heartbeatInterval);
  assert.strictEqual(context.timers.reconnectWindowMs, 15_000);
  assert.strictEqual(context.timers.getSessionTimer(session), 'session-timer');
  assert.strictEqual(context.timers.getRoomDisconnectTimer(slot), 'room-timer');
  assert.strictEqual(context.timers.getRoomEmptyTimer(room), 'empty-timer');
  assert.strictEqual(context.persistence.saveResult, true);
  assert.strictEqual(context.broadcasts.panel, true);
  assert.strictEqual(context.identity.playerId, true);
  assert.strictEqual(context.panelState.build, true);
  console.log('OK: wsContext conserva referencias, examMode y timers sin duplicar estado.');
} finally {
  clearInterval(heartbeatInterval);
}
