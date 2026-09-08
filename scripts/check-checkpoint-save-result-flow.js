'use strict';

const assert = require('assert');
const { createSessionStore } = require('../src/server/sessionStore');
const { createWsContext } = require('../src/server/ws/wsContext');
const { handleGameCheckpoint } = require('../src/server/ws/gameCheckpointMessages');
const { createSaveResultMessages } = require('../src/server/ws/saveResultMessages');
const { createResultIdempotency } = require('../src/server/ws/resultIdempotency');
const { getAccountPlayerId, resolveAccountPlayer, getSessionId } = require('../src/identity');
const { buildCompletedResultRecord, upsertCompletedResult } = require('../src/game/ranking');
const { upsertCheckpoint } = require('../src/game/checkpoints');
const { calculateGameRewards } = require('../src/game/gameRewards');
const { ensurePlayerExperience } = require('../src/game/playerLevels');
const { calculateDailyStreak } = require('../src/game/dailyStreak');
const { ACHIEVEMENTS_DEF, checkNewAchievements } = require('../src/game/achievements');
const { buildPanelState } = require('../src/server/panelState');

// All persistence is an isolated in-memory fixture; no project JSON is opened.
let ranking = [];
const players = [{ id: 'acct-1', name: 'Ana Canonica', grade: '3', aureos: 10, experiencia: 0, dailyStreak: {} }];
const savedRanking = [];
const savedPlayers = [];
const sent = [];
const aureosLog = [];
const examFinished = new Map();
const rooms = new Map();
const gameSessions = createSessionStore();
const ws = { readyState: 1, _uid: 'session-1', playerId: 'session-1', playerName: 'Ana Canonica', roomId: null };
const wsContext = createWsContext({
  gameSessions,
  rooms,
  maestroClients: new Set(),
  rankingLiveClients: new Set(),
  examFinished,
  getExamMode: () => null,
  persistence: {
    loadRanking: () => ranking,
    saveRanking: value => { ranking = [...value]; savedRanking.push([...value]); },
    loadPlayers: () => players,
    savePlayers: value => { savedPlayers.push(JSON.parse(JSON.stringify(value))); },
  },
  identity: { getAccountPlayerId, resolveAccountPlayer, getSessionId },
});

const persistCheckpoint = (message, canonicalName) => {
  const result = upsertCheckpoint(ranking, message, canonicalName, { now: new Date('2026-01-02T12:00:00Z') });
  if (result.saved) {
    ranking = result.ranking;
    savedRanking.push([...ranking]);
  }
  return result;
};
const checkpoint = { type: 'game_checkpoint', id: 'flow-1', name: 'ana canonica', accountPlayerId: 'acct-1', grade: '3', score: 100, correct: 5, total: 5, pct: 100, tblResults: { 2: { total: 5 } } };
handleGameCheckpoint({
  ws, message: checkpoint, wsContext, sessionStore: gameSessions,
  identity: { getAccountPlayerId, resolveAccountPlayer },
  persistence: { loadPlayers: () => players },
  ranking: { persistCheckpoint },
});
assert.strictEqual(ranking.length, 1);
assert.strictEqual(ranking[0].complete, false);
assert.strictEqual(ranking[0].name, 'Ana Canonica');

gameSessions.createSession('session-1', { name: 'Ana Canonica', ws });
const saveResultMessages = createSaveResultMessages({
  wsContext,
  WebSocket: { OPEN: 1 },
  multiplayerRewards: { _mpEarnedByGame: new Map() },
  buildCompletedResultRecord,
  upsertCompletedResult,
  calculateGameRewards,
  ensurePlayerExperience,
  logAureosTx: (player, amount, reason) => aureosLog.push({ player, amount, reason }),
  calculateDailyStreak,
  checkNewAchievements,
  ACHIEVEMENTS_DEF,
  send: (socket, message) => sent.push({ socket, message }),
  L: { rank: () => {} },
  resultIdempotency: createResultIdempotency(),
});

const finalMessage = { ...checkpoint, type: 'save_result', gameType: 'timed', difficulty: 'medium', gameMode: 'solo', wrong: 0, timeout: 0 };
saveResultMessages.handleSaveResult(ws, finalMessage);
assert.strictEqual(ranking.length, 1);
assert.strictEqual(ranking[0].complete, true);
assert.strictEqual(ranking[0].id, 'flow-1');
assert.strictEqual(ranking[0].name, 'Ana Canonica');
assert.strictEqual(players[0].aureos > 10, true);
assert.strictEqual(players[0].experiencia > 0, true);
assert.strictEqual(players[0].gamesPlayed, 1);
assert.strictEqual(gameSessions.getSession('session-1'), undefined);
const afterFirst = { aureos: players[0].aureos, experiencia: players[0].experiencia, gamesPlayed: players[0].gamesPlayed, sent: sent.length, savedPlayers: savedPlayers.length, rankingSaves: savedRanking.length };

saveResultMessages.handleSaveResult(ws, finalMessage);
assert.deepStrictEqual({ aureos: players[0].aureos, experiencia: players[0].experiencia, gamesPlayed: players[0].gamesPlayed, sent: sent.length, savedPlayers: savedPlayers.length, rankingSaves: savedRanking.length }, afterFirst);
assert.strictEqual(ranking.length, 1);

const legacyWs = { readyState: 1, _uid: 'legacy-session', playerId: 'legacy-session', playerName: 'Legado' };
saveResultMessages.handleSaveResult(legacyWs, { ...finalMessage, id: 'flow-legacy', name: 'Legado', accountPlayerId: undefined, score: 0 });
assert.strictEqual(ranking.length, 2);
assert.strictEqual(ranking.filter(item => item.id === 'flow-legacy').length, 1);
assert.strictEqual(sent.length, 2);
assert.strictEqual(sent[0].message.type, 'aureos_earned');
assert.strictEqual(sent[1].message.type, 'achievements_unlocked');

const panelState = buildPanelState({ sessions: [], players, findRoom: () => null, isOpen: socket => socket?.readyState === 1, examMode: null, examFinished: [] });
assert.deepStrictEqual(Object.keys(panelState), ['sessions', 'connectedNames', 'ts', 'examMode', 'opStats', 'examFinished']);
console.log('OK: flujo integrado checkpoint -> save_result reemplaza, recompensa una vez, limpia sesion y conserva panel.');
