'use strict';

const assert = require('assert');
const { buildPanelState, createPanelBroadcaster } = require('../src/server/panelState');

const player = { name: 'Ana', avatar: { hair: 'short' }, themeColor: '#00e5ff' };
const room = {
  name: 'Sala Ana', hostName: 'Ana', status: 'playing', maxPlayers: 2,
  players: [{ name: 'Ana', idx: 0, role: 'host' }, { name: 'Beto', idx: 1, disconnected: true }],
};
const state = buildPanelState({
  now: 10_000,
  players: [player],
  findRoom: id => id === 'room-a' ? room : null,
  isOpen: ws => ws?.readyState === 1,
  sessions: [{
    id: 'session-a', name: 'Ana', grade: '3A', ws: { readyState: 1, roomId: 'room-a', playerIdx: 0, role: 'host' },
    startTime: 9_000, gameMode: 'online', score: 42, roomId: 'room-a', disconnected: false,
  }],
  examMode: { grade: '3A' },
  opStats: { mult: { pct: 90, games: 1 } },
  examFinished: [{ name: 'Beto', finished: true }],
});
assert.deepStrictEqual(Object.keys(state), ['sessions', 'connectedNames', 'ts', 'examMode', 'opStats', 'examFinished']);
assert.deepStrictEqual(state.connectedNames, ['ana']);
assert.strictEqual(state.sessions[0].roomName, 'Sala Ana');
assert.strictEqual(state.sessions[0].roomPlayers[1].disconnected, true);
assert.strictEqual(state.sessions[0].elapsed, 1);
assert.deepStrictEqual(Object.keys(state.sessions[0]), [
  'id', 'name', 'grade', 'avatar', 'themeColor', 'gameMode', 'mpGameMode', 'gameType', 'difficulty', 'isExam',
  'score', 'qIndex', 'totalQ', 'currentTable', 'currentQuestion', 'correct', 'wrong', 'tblSelMode', 'tables',
  'paused', 'startTime', 'elapsed', 'status', 'inventory', 'lives', 'livesTotal', 'streak', 'timeLeft', 'timeLimit',
  'lastResult', 'lastResultTs', 'tblResults', 'disconnected', 'roomId', 'roomName', 'roomHostName', 'roomStatus',
  'roomPlayerCount', 'roomMaxPlayers', 'roomPlayers', 'playerIdx', 'role',
]);

const clients = new Set([{ readyState: 1 }]);
let broadcasts = 0;
const broadcaster = createPanelBroadcaster({
  getClients: () => clients,
  getState: () => state,
  isOpen: client => client.readyState === 1,
  send: () => { broadcasts++; },
  throttleMs: 0,
});
assert.strictEqual(broadcaster.broadcast(), true);
assert.strictEqual(broadcaster.broadcast(), false, 'un estado idéntico no debe duplicar broadcast');
state.sessions[0].score = 43;
assert.strictEqual(broadcaster.broadcast(), true);
assert.strictEqual(broadcasts, 2);
broadcaster.stop();

console.log('OK: panel_state conserva estructura, sesiones, salas, conectados y anti-duplicación.');
