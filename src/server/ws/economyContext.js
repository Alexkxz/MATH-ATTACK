'use strict';

// Economic WebSocket dependencies are grouped here without owning their state.
function createEconomyContext({
  rooms,
  gameSessions,
  _awardedPotGames,
  _awardedBonusGames,
  _mpEarnedByGame,
  pendingPotMsgs,
  sendOrQueueMsg,
  persistence = {},
  identity = {},
  send,
  broadcasts = {},
  idempotency = {},
}) {
  return Object.freeze({
    rooms,
    gameSessions,
    _awardedPotGames,
    _awardedBonusGames,
    _mpEarnedByGame,
    pendingPotMsgs,
    sendOrQueueMsg,
    persistence: Object.freeze({ ...persistence }),
    identity: Object.freeze({ ...identity }),
    send,
    broadcasts: Object.freeze({ ...broadcasts }),
    idempotency: Object.freeze({ ...idempotency }),
  });
}

module.exports = { createEconomyContext };
