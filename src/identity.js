'use strict';

const { resolveCanonicalPlayer } = require('./game/players');

// `playerId` remains the public legacy alias. Internally, payloads are resolved
// as account IDs while WebSocket connections retain their session identity.
function getAccountPlayerId(payload = {}) {
  return payload.accountPlayerId ?? payload.playerId ?? null;
}

function resolveAccountPlayer(players, payload = {}) {
  return resolveCanonicalPlayer(players, {
    id: getAccountPlayerId(payload),
    name: payload.name,
  });
}

function getSessionId(connection) {
  return connection?.playerId ?? connection?._uid ?? null;
}

function getExternalPlayerId(connection) {
  return getSessionId(connection);
}

function findActiveSession(sessions, sessionId) {
  if (!sessionId || !sessions || typeof sessions.get !== 'function') return undefined;
  return sessions.get(sessionId);
}

function getConnectionId(connection) {
  return connection?._connId ?? null;
}

function findConnectionById(connections, connectionId) {
  if (connectionId === null || connectionId === undefined || !connections) return undefined;
  for (const connection of connections) {
    if (getConnectionId(connection) === connectionId) return connection;
  }
  return undefined;
}

module.exports = {
  getAccountPlayerId,
  resolveAccountPlayer,
  getSessionId,
  getExternalPlayerId,
  findActiveSession,
  getConnectionId,
  findConnectionById,
};
