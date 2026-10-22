'use strict';

function createPlayerIdentityMessages({ wsContext, genId, checkExamNotify, deliverPendingPotMsg, schedulePanelBroadcast, testService }) {
  const gameSessions = wsContext.gameSessions;
  const { getSessionId, findActiveSession } = wsContext.identity;
  const { resolveAccountPlayer } = wsContext.identity;
  const { loadPlayers = () => [] } = wsContext.persistence || {};
  const activeStudentSockets=new Map();

  function reviveSession(ws, name) {
    const session = gameSessions.restoreSession(name, ws);
    if (!session) return null;
    ws.playerId = session.id;
    ws._uid = session.id;
    ws.playerName = name;
    ws.grade = session.grade || '';
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
    if(ws._studentAccountPlayerId){const priorEntry=activeStudentSockets.get(ws._studentAccountPlayerId),prior=priorEntry?.ws;if(prior&&prior!==ws&&Number(ws._studentAuthIssuedAt||0)<Number(priorEntry.issuedAt||0)){try{ws.close(4002,'student session superseded');}catch(_){}return;}activeStudentSockets.set(ws._studentAccountPlayerId,{ws,issuedAt:Number(ws._studentAuthIssuedAt)||0});if(prior&&prior!==ws&&prior.readyState===1){if(prior._examAttemptBinding&&testService){try{testService.disconnectStudentAttempt(prior._examAttemptBinding);prior._examAttemptBinding=null;}catch(_){activeStudentSockets.set(ws._studentAccountPlayerId,priorEntry);try{ws.close(1011,'could not freeze exam before recovery');}catch(__){}return;}}try{prior.close(4001,'student session recovered elsewhere');}catch(_){}}if(!ws._studentSocketCleanupAttached){ws._studentSocketCleanupAttached=true;ws.on('close',()=>{const active=activeStudentSockets.get(ws._studentAccountPlayerId);if(active?.ws===ws)activeStudentSockets.delete(ws._studentAccountPlayerId);});}}
    const session = getOrCreateSession(ws, message);
    session.ws = ws;
    session.id = ws.playerId;
    const authenticated=ws._studentAccountPlayerId?resolveAccountPlayer(loadPlayers(),{accountPlayerId:ws._studentAccountPlayerId}):null;
    session.accountPlayerId=ws._studentAccountPlayerId||session.accountPlayerId||null;
    session.name = authenticated?.name || message.name || session.name || '?';
    session.grade = authenticated?.grade || message.grade || session.grade || '';
    ws.playerName = session.name;
    ws.grade = session.grade;
    if (!session.gameMode) session.gameMode = 'idle';
    checkExamNotify(ws, session.grade);
    deliverPendingPotMsg(session);
  }

  function handleSessionUpdate(ws, message) {
    if(ws._studentAccountPlayerId&&activeStudentSockets.get(ws._studentAccountPlayerId)?.ws&&activeStudentSockets.get(ws._studentAccountPlayerId).ws!==ws)return true;
    const session = getOrCreateSession(ws, message);
    const authenticated=ws._studentAccountPlayerId?resolveAccountPlayer(loadPlayers(),{accountPlayerId:ws._studentAccountPlayerId}):null;
    if (authenticated) ws.playerName=authenticated.name; else if (message.name) ws.playerName = message.name;
    session.ws = ws;
    session.id = getSessionId(ws);
    session.accountPlayerId=ws._studentAccountPlayerId||session.accountPlayerId||null;
    session.name = authenticated?.name || message.name || ws.playerName || '?';
    session.grade = authenticated?.grade || message.grade || '';
    ws.playerName = session.name;
    ws.grade = session.grade;
    checkExamNotify(ws, session.grade);
    session.gameMode = message.gameMode || 'solo';
    session.mpGameMode = message.mpGameMode || '';
    session.gameType = message.gameType || 'timed';
    session.difficulty = message.difficulty || '';
    session.isExam = !!message.isExam;
    session.examTestId = message.isExam ? (message.examTestId || '') : '';
    session.examStartedAt = message.isExam ? (message.examStartedAt || 0) : 0;
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
    session.questionElapsedMs = Math.max(0, Number(message.questionElapsedMs) || 0);
    session.lastResult = message.lastResult || null;
    session.lastResultTs = message.lastResultTs || 0;
    session.tblResults = message.tblResults || {};
    if (testService && ws._studentAccountPlayerId && session.isExam && session.examTestId && session.examStartedAt) {
      try {
        // The account ID comes from the authenticated HTTP session attached at
        // the WebSocket handshake; never accept it from the student message.
        const saved=testService.recordLiveExamProgress({ testId: session.examTestId, accountPlayerId: ws._studentAccountPlayerId, studentSnapshot: { name: session.name, grade: session.grade || '' }, message });
        if(saved?.attempt)ws._examAttemptBinding={testId:session.examTestId,attemptId:saved.attempt.attemptId,accountPlayerId:ws._studentAccountPlayerId};
      } catch (error) { console.error('No se pudo guardar el avance de la prueba:',error.message); }
    }
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
