'use strict';

function createPlayerIdentityMessages({ wsContext, genId, checkExamNotify, deliverPendingPotMsg, schedulePanelBroadcast }) {
  const gameSessions = wsContext.gameSessions;
  const { getSessionId, findActiveSession } = wsContext.identity;

  function reviveSession(ws, name) {
    const session = gameSessions.restoreSession(name, ws);
    if (!session) return null;
    ws.playerId = session.id;
    ws._uid = session.id;
    ws.playerName = name;
    return session;
  }

  function getOrCreateSession(ws, message) {
    let session = reviveSession(ws, message.name);
    if (!session) {
      const sessionId = getSessionId(ws) || (ws._uid = genId());
      if (message.name) ws.playerName = message.name;
      if (!ws.playerId) ws.playerId = sessionId;
      session = findActiveSession(gameSessions, sessionId);
      if (!session) session = gameSessions.createSession(sessionId, { startTime: Date.now() });
    }
    return session;
  }

  function handlePlayerIdentify(ws, message) {
    const session = getOrCreateSession(ws, message);
    session.ws = ws;
    session.id = ws.playerId;
    session.name = message.name || session.name || '?';
    session.grade = message.grade || session.grade || '';
    if (!session.gameMode) session.gameMode = 'idle';
    checkExamNotify(ws, session.grade);
    deliverPendingPotMsg(session);
  }

  function handleSessionUpdate(ws, message) {
    const session = getOrCreateSession(ws, message);
    if (message.name) ws.playerName = message.name;
    checkExamNotify(ws, message.grade);
    session.ws = ws;
    session.id = getSessionId(ws);
    session.name = message.name || ws.playerName || '?';
    session.grade = message.grade || '';
    session.gameMode = message.gameMode || 'solo';
    session.mpGameMode = message.mpGameMode || '';
    session.gameType = message.gameType || 'timed';
    session.difficulty = message.difficulty || '';
    session.isExam = !!message.isExam;
    session.score = message.score || 0;
    session.qIndex = message.qIndex || 0;
    session.totalQ = message.totalQ || 0;
    session.currentTable = message.currentTable || 0;
    session.currentQuestion = message.currentQuestion || '';
    session.correct = message.correct || 0;
    session.wrong = message.wrong || 0;
    session.tblSelMode = message.tblSelMode || 'all';
    session.tables = message.tables || [];
    session.paused = message.paused || false;
    session.status = message.status || 'playing';
    session.inventory = message.inventory || {};
    session.lives = message.lives || 0;
    session.livesTotal = message.livesTotal || 0;
    session.streak = message.streak || 0;
    session.timeLeft = message.timeLeft || 0;
    session.timeLimit = message.timeLimit || 0;
    session.lastResult = message.lastResult || null;
    session.lastResultTs = message.lastResultTs || 0;
    session.tblResults = message.tblResults || {};
    schedulePanelBroadcast();
    deliverPendingPotMsg(session);
  }

  function handle(ws, message) {
    if (message?.type === 'player_identify') {
      handlePlayerIdentify(ws, message);
      return true;
    }
    if (message?.type === 'session_update') {
      handleSessionUpdate(ws, message);
      return true;
    }
    return false;
  }

  return Object.freeze({ handle, handlePlayerIdentify, handleSessionUpdate });
}

module.exports = { createPlayerIdentityMessages };
