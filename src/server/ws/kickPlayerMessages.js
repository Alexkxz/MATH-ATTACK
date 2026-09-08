'use strict';

function createKickPlayerMessages({
  ADMIN_PASSWORD,
  gameSessions,
  findActiveSession,
  send,
  pushConnLog,
  L,
  WebSocket,
  scheduleTermination = setTimeout,
}) {
  function resolveSession(playerId) {
    const direct = findActiveSession(gameSessions, playerId);
    if (direct) return direct;
    if (typeof gameSessions.listSessions !== 'function') return undefined;
    return gameSessions.listSessions().find(session => String(session.id) === String(playerId));
  }

  function handleKickPlayer(ws, message) {
    if (message.type !== 'kick_player' || !message.playerId || message.password !== ADMIN_PASSWORD) return false;
    const session = resolveSession(message.playerId);
    if (session?.ws?.readyState !== WebSocket.OPEN) return true;
    const playerName = session.name || message.playerId;
    pushConnLog('kick', `⚡ Maestro desconectó a ${playerName}`);
    L.disc(`Maestro desconectó forzosamente a ${playerName}`);
    const kickedWs = session.ws;
    kickedWs._kicked = true;
    send(kickedWs, { type: 'kicked', reason: 'El maestro te desconectó del juego.' });
    scheduleTermination(() => kickedWs.terminate(), 150);
    return true;
  }

  return Object.freeze({ handleKickPlayer });
}

module.exports = { createKickPlayerMessages };
