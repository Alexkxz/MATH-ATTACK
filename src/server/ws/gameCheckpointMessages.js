'use strict';

function handleGameCheckpoint({ ws, message, wsContext, sessionStore, identity, persistence, ranking, broadcasts = {} }) {
  // sessionStore, ws and broadcasts are explicit dependencies for the handler
  // boundary; the current protocol does not require a session lookup or reply.
  void ws;
  void sessionStore;
  void broadcasts;
  if (!message.id || !message.name) return false;

  const players = persistence.loadPlayers();
  const accountPlayerId = identity.getAccountPlayerId(message);
  const player = identity.resolveAccountPlayer(players, { accountPlayerId, name: message.name || '' });
  ranking.persistCheckpoint(message, player ? player.name : (message.name || '?'));
  return true;
}

module.exports = { handleGameCheckpoint };
