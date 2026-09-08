'use strict';

function createPotDeductMessages({ wsContext, findPlayerByName, ensurePlayerExperience, logAureosTx, L }) {
  const economy = wsContext.economy;
  const { loadPlayers, savePlayers } = economy.persistence;
  const idempotency = economy.idempotency;

  function handlePotDeduct(ws, message) {
    const playerName = ws.playerName || '';
    if (!playerName || !message.amount) return false;
    if (message.id && idempotency?.hasPotDeductId?.(message.id)) return false;
    const players = loadPlayers();
    const player = findPlayerByName(players, playerName);
    if (!player) {
      economy.send(ws, { type: 'pot_deduct_result', ok: false, error: 'Jugador no encontrado' });
      return true;
    }
    ensurePlayerExperience(player);
    const cost = Math.max(0, Math.floor(message.amount));
    if ((player.aureos || 0) < cost) {
      economy.send(ws, { type: 'pot_deduct_result', ok: false, error: 'Áureos insuficientes', aureos: player.aureos || 0 });
      return true;
    }
    const before = { ...player };
    player.aureos = (player.aureos || 0) - cost;
    try {
      savePlayers(players);
    } catch (error) {
      Object.keys(player).forEach(key => delete player[key]);
      Object.assign(player, before);
      throw error;
    }
    logAureosTx(player, -cost, 'apuesta_jugada');
    if (message.id && idempotency?.markPotDeductId) idempotency.markPotDeductId(message.id);
    L.game(`${playerName} apostó ${cost} Áureos (pot_deduct) — quedan ${player.aureos}`);
    economy.send(ws, { type: 'pot_deduct_result', ok: true, aureos: player.aureos, amount: cost });
    return true;
  }

  return Object.freeze({ handlePotDeduct });
}

module.exports = { createPotDeductMessages };
