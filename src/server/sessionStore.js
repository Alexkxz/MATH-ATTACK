'use strict';

const DEFAULT_RECONNECT_WINDOW_MS = 15_000;

function createSessionStore({ reconnectWindowMs = DEFAULT_RECONNECT_WINDOW_MS, onExpire = () => {} } = {}) {
  const sessions = new Map();

  function clearDisconnectTimer(session) {
    if (session?._disconnectTimer) {
      clearTimeout(session._disconnectTimer);
      session._disconnectTimer = null;
    }
  }

  function createSession(sessionId, initial = {}) {
    if (!sessionId) return undefined;
    const existing = sessions.get(sessionId);
    if (existing) return existing;
    const session = { id: sessionId, startTime: Date.now(), ...initial };
    sessions.set(sessionId, session);
    return session;
  }

  function getSession(sessionId) {
    if (!sessionId) return undefined;
    return sessions.get(sessionId);
  }

  function updateSession(sessionId, patch = {}) {
    const session = getSession(sessionId);
    if (!session) return undefined;
    Object.assign(session, patch);
    return session;
  }

  function removeSession(sessionId) {
    const session = getSession(sessionId);
    if (!session) return false;
    clearDisconnectTimer(session);
    return sessions.delete(sessionId);
  }

  function listSessions() {
    return [...sessions.values()];
  }

  function markDisconnected(sessionId, now = Date.now()) {
    const session = getSession(sessionId);
    if (!session) return undefined;
    clearDisconnectTimer(session);
    session.disconnected = true;
    session.disconnectedAt = now;
    session.ws = null;
    session._disconnectTimer = setTimeout(() => {
      if (getSession(sessionId) === session) {
        removeSession(sessionId);
        onExpire(session, sessionId);
      }
    }, reconnectWindowMs);
    return session;
  }

  function restoreSession(name, connection) {
    if (!name) return undefined;
    const normalizedName = String(name).toLowerCase();
    const session = listSessions().find(candidate =>
      candidate.disconnected && candidate.name &&
      String(candidate.name).toLowerCase() === normalizedName
    );
    if (!session) return undefined;
    clearDisconnectTimer(session);
    session.disconnected = false;
    session.disconnectedAt = null;
    session.ws = connection;
    return session;
  }

  function cleanupExpiredSessions(now = Date.now()) {
    const expired = [];
    listSessions().forEach(session => {
      if (!session.disconnected || session.disconnectedAt == null) return;
      if (now - session.disconnectedAt < reconnectWindowMs) return;
      expired.push(session.id);
      removeSession(session.id);
      onExpire(session, session.id);
    });
    return expired.length;
  }

  return {
    createSession,
    getSession,
    updateSession,
    removeSession,
    listSessions,
    markDisconnected,
    restoreSession,
    cleanupExpiredSessions,
  };
}

module.exports = { DEFAULT_RECONNECT_WINDOW_MS, createSessionStore };
