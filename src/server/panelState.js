'use strict';

const PANEL_THROTTLE_MS = 100;

function buildPanelState({
  sessions = [],
  players = [],
  findRoom = () => null,
  isOpen = () => false,
  now = Date.now(),
  examMode = null,
  opStats,
  examFinished = [],
}) {
  const playersByName = new Map(players.map(player => [String(player.name || '').toLowerCase(), player]));
  const sessionState = sessions.map(session => {
    const player = playersByName.get(String(session.name || '').toLowerCase());
    const roomId = session.roomId || session.ws?.roomId || null;
    const room = roomId ? findRoom(roomId) : null;
    const roomPlayers = room?.players || [];
    return {
      id: session.id, name: session.name, grade: session.grade,
      avatar: player?.avatar || {}, themeColor: player?.themeColor || '',
      gameMode: session.gameMode || 'idle', mpGameMode: session.mpGameMode || '',
      gameType: session.gameType || '', difficulty: session.difficulty || '', isExam: session.isExam || false,
      score: session.score || 0, qIndex: session.qIndex || 0, totalQ: session.totalQ || 0,
      currentTable: session.currentTable || 0, currentQuestion: session.currentQuestion || '',
      correct: session.correct || 0, wrong: session.wrong || 0,
      tblSelMode: session.tblSelMode || '', tables: session.tables || [],
      paused: !!session.paused, startTime: session.startTime,
      elapsed: Math.floor((now - (session.startTime || now)) / 1000),
      status: session.status || '',
      inventory: session.inventory || {},
      lives: session.lives || 0, livesTotal: session.livesTotal || 0,
      streak: session.streak || 0,
      timeLeft: session.timeLeft || 0, timeLimit: session.timeLimit || 0,
      lastResult: session.lastResult || null, lastResultTs: session.lastResultTs || 0,
      tblResults: session.tblResults || {},
      disconnected: !!session.disconnected,
      roomId,
      roomName: room?.name || '',
      roomHostName: room?.hostName || '',
      roomStatus: room?.status || '',
      roomPlayerCount: roomPlayers.length || 0,
      roomMaxPlayers: room?.maxPlayers || 0,
      roomPlayers: roomPlayers.map(playerInRoom => ({
        name: playerInRoom.name,
        idx: playerInRoom.idx,
        role: playerInRoom.role || '',
        disconnected: !!playerInRoom.disconnected,
      })),
      playerIdx: session.ws?.playerIdx ?? session.playerIdx ?? null,
      role: session.ws?.role || session.role || '',
    };
  });
  const connectedNames = sessions
    .filter(session => isOpen(session.ws))
    .map(session => String(session.name || '').toLowerCase());
  return {
    sessions: sessionState,
    connectedNames,
    ts: now,
    examMode: examMode || null,
    opStats,
    examFinished,
  };
}

function createPanelBroadcaster({
  getClients,
  getState,
  isOpen = () => true,
  send,
  onBroadcast = () => {},
  hasSessions = () => false,
  throttleMs = PANEL_THROTTLE_MS,
}) {
  let lastHash = '';
  let lastSent = 0;
  let throttleTimer = null;
  let heartbeatTimer = null;

  function broadcast() {
    const clients = getClients();
    if (!clients || clients.size === 0) return false;
    const state = getState();
    const { ts: _ts, ...stableState } = state;
    const hash = JSON.stringify(stableState);
    if (hash === lastHash) return false;
    lastHash = hash;
    clients.forEach(client => {
      if (!isOpen(client)) clients.delete(client);
      else send(client, state);
    });
    onBroadcast(state);
    return true;
  }

  function scheduleBroadcast() {
    const now = Date.now();
    const elapsed = now - lastSent;
    if (elapsed >= throttleMs) {
      lastSent = now;
      if (throttleTimer) { clearTimeout(throttleTimer); throttleTimer = null; }
      return broadcast();
    }
    if (!throttleTimer) {
      throttleTimer = setTimeout(() => {
        throttleTimer = null;
        lastSent = Date.now();
        broadcast();
      }, throttleMs - elapsed);
    }
    return false;
  }

  function scheduleHeartbeat() {
    const interval = hasSessions() ? 1000 : 5000;
    heartbeatTimer = setTimeout(() => {
      broadcast();
      scheduleHeartbeat();
    }, interval);
  }

  function stop() {
    if (heartbeatTimer) { clearTimeout(heartbeatTimer); heartbeatTimer = null; }
    if (throttleTimer) { clearTimeout(throttleTimer); throttleTimer = null; }
  }

  return { broadcast, scheduleBroadcast, scheduleHeartbeat, stop };
}

module.exports = { PANEL_THROTTLE_MS, buildPanelState, createPanelBroadcaster };
