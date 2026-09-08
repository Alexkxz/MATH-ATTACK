'use strict';

function createPotDrawMessages({ wsContext, findPlayerByName, ensurePlayerExperience, logAureosTx, L }) {
  const economy = wsContext.economy;
  const { _awardedPotGames, persistence, sendOrQueueMsg, send } = economy;
  const { loadPlayers, savePlayers } = persistence;

  function handlePotDraw(ws, message) {
    const gameKey = `${ws.roomId || '?'}_${message.gameId || ''}`;
    if (_awardedPotGames.has(gameKey)) return false;
    const betAmount = Math.max(0, Math.floor(message.betAmount || 0));
    const names = Array.isArray(message.names) ? message.names : [];
    if (betAmount <= 0 || !names.length) return false;
    const players = loadPlayers();
    const refunds = names.map(name => ({ name, player: findPlayerByName(players, name) }));
    if (refunds.some(refund => !refund.player)) return false;
    if (new Set(refunds.map(refund => refund.player)).size !== refunds.length) return false;
    const before = refunds.map(refund => ({ player: refund.player, value: { ...refund.player } }));
    refunds.forEach(({ player }) => {
      ensurePlayerExperience(player);
      player.aureos = (player.aureos || 0) + betAmount;
    });
    try {
      savePlayers(players);
    } catch (error) {
      before.forEach(({ player, value }) => {
        Object.keys(player).forEach(key => delete player[key]);
        Object.assign(player, value);
      });
      throw error;
    }
    refunds.forEach(({ name, player }) => {
      logAureosTx(player, betAmount, 'apuesta_empate');
      sendOrQueueMsg(name, { type: 'pot_result', result: 'draw', amount: betAmount, total: player.aureos });
    });
    _awardedPotGames.add(gameKey);
    L.game(`Empate en pozo de apuestas â€” reembolsados ${betAmount} a [${names.join(', ')}]`);
    send(ws, { type: 'pot_award_result', ok: true, draw: true });
    return true;
  }

  return Object.freeze({ handlePotDraw });
}

module.exports = { createPotDrawMessages };
