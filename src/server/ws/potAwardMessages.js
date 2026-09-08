'use strict';

function createPotAwardMessages({ wsContext, findPlayerByName, ensurePlayerExperience, logAureosTx, L }) {
  const economy = wsContext.economy;
  const { _awardedPotGames, persistence, sendOrQueueMsg, send } = economy;
  const { loadPlayers, savePlayers } = persistence;

  function handlePotAward(ws, message) {
    const winnerName = message.winnerName || '';
    const prize = Math.max(0, Math.floor(message.amount || 0));
    if (!winnerName || prize <= 0) return false;
    const gameKey = `${ws.roomId || '?'}_${message.gameId || ''}`;
    if (_awardedPotGames.has(gameKey)) return false;
    const players = loadPlayers();
    const winner = findPlayerByName(players, winnerName);
    if (!winner) return false;
    const before = { ...winner };
    ensurePlayerExperience(winner);
    winner.aureos = (winner.aureos || 0) + prize;
    try {
      savePlayers(players);
    } catch (error) {
      Object.keys(winner).forEach(key => delete winner[key]);
      Object.assign(winner, before);
      throw error;
    }
    logAureosTx(winner, prize, 'apuesta_ganada');
    _awardedPotGames.add(gameKey);
    L.game(`${winnerName} ganÃ³ ${prize} Ãureos (pot_award) â€” total ${winner ? winner.aureos : '?'}`);
    sendOrQueueMsg(winnerName, { type: 'pot_result', result: 'win', amount: prize, total: winner.aureos });
    const betAmount = Math.max(0, Math.floor(message.betAmount || 0));
    const losers = Array.isArray(message.losers) ? message.losers : [];
    losers.forEach(name => {
      if (!name || name.toLowerCase() === winnerName.toLowerCase()) return;
      sendOrQueueMsg(name, { type: 'pot_result', result: 'lose', amount: betAmount });
    });
    send(ws, { type: 'pot_award_result', ok: true, winnerName, amount: prize, total: winner.aureos });
    return true;
  }

  return Object.freeze({ handlePotAward });
}

module.exports = { createPotAwardMessages };
