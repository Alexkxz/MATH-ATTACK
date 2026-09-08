'use strict';

// Shared dependency context for the WebSocket server. This module deliberately
// owns no mutable state; every value comes from the server initializer.
function createWsContext(dependencies = {}) {
  const {
    gameSessions,
    rooms,
    maestroClients,
    rankingLiveClients,
    examFinished,
    getExamMode,
    setExamMode,
    timers = {},
    persistence = {},
    broadcasts = {},
    identity = {},
    panelState = {},
    economy,
  } = dependencies;

  return Object.freeze({
    gameSessions,
    rooms,
    maestroClients,
    rankingLiveClients,
    examFinished,
    getExamMode: getExamMode || (() => undefined),
    setExamMode: setExamMode || (() => undefined),
    timers: Object.freeze({
      heartbeatInterval: timers.heartbeatInterval,
      reconnectWindowMs: timers.reconnectWindowMs,
      getSessionTimer: timers.getSessionTimer || (session => session?._disconnectTimer),
      getRoomDisconnectTimer: timers.getRoomDisconnectTimer || (slot => slot?._disconnectTimer),
      getRoomEmptyTimer: timers.getRoomEmptyTimer || (room => room?._emptyTimer),
    }),
    persistence: Object.freeze({ ...persistence }),
    broadcasts: Object.freeze({ ...broadcasts }),
    identity: Object.freeze({ ...identity }),
    panelState: Object.freeze({ ...panelState }),
    economy,
  });
}

module.exports = { createWsContext };
