'use strict';

function createMpWinnerBonusMessages({ wsContext, findPlayerByName, ensurePlayerExperience, logAureosTx, L }) {
  const economy = wsContext.economy;
  const { _mpEarnedByGame, _awardedBonusGames, persistence, sendOrQueueMsg } = economy;
  const { loadPlayers, savePlayers } = persistence;

  function handleMpWinnerBonus(ws, message) {
    const winners = Array.isArray(message.winners) ? message.winners : [];
    if (!winners.length || !message.gameId) return false;
    const gameKey = `${ws.roomId || '?'}_${message.gameId}_bonus`;
    if (_awardedBonusGames.has(gameKey)) return false;
    const players = loadPlayers();
    const bonuses = winners.map(name => {
      const earnedKey = `${ws.roomId || '?'}_${message.gameId}_${(name || '').toLowerCase()}`;
      const earned = _mpEarnedByGame.get(earnedKey);
      if (!earned) return null;
      const player = findPlayerByName(players, name || '');
      if (!player) return null;
      return { name, earnedKey, earned, player };
    });
    if (bonuses.some(bonus => !bonus)) return false;
    if (new Set(bonuses.map(bonus => bonus.player)).size !== bonuses.length) return false;
    const before = bonuses.map(({ player }) => ({ player, value: { ...player } }));
    bonuses.forEach(({ earned, player }) => {
      const baseExperience = ensurePlayerExperience(player);
      player.aureos = (player.aureos || 0) + earned;
      player.experiencia = baseExperience + earned;
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
    bonuses.forEach(({ name, earnedKey, earned, player }) => {
      logAureosTx(player, earned, 'bono_ganador_mp');
      _mpEarnedByGame.delete(earnedKey);
      sendOrQueueMsg(name, { type: 'coin_bonus', amount: earned, total: player.aureos, experiencia: player.experiencia, experience: player.experiencia });
    });
    _awardedBonusGames.add(gameKey);
    L.game(`Bono de ganador (x2) repartido a [${winners.join(', ')}] en sala [${ws.roomId || '?'}]`);
    return true;
  }

  return Object.freeze({ handleMpWinnerBonus });
}

module.exports = { createMpWinnerBonusMessages };
