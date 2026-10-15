'use strict';

function createCoinRobMessages({ wsContext, findPlayerByName, consumePlayerInventoryItem, logAureosTx, send, L }) {
  const { loadPlayers, savePlayers } = wsContext.persistence;

  function sendGame(ws, data) {
    if (ws?.readyState === 1) send(ws, { type: 'game_msg', data });
  }

  function rejectUse(ws, inventory, reason = 'unavailable') {
    const quantity = inventory && Object.prototype.hasOwnProperty.call(inventory, 'coinrob')
      ? Math.max(0, Number(inventory.coinrob) || 0)
      : 0;
    sendGame(ws, {
      type: 'coinrob_rejected', inventory: { coinrob: quantity },
      inventoryAuthoritative: !!inventory, reason,
    });
  }

  function handle(ws, room, message) {
    const data = message.data || {};
    const sender = room.players.find(player => player.ws === ws);
    if (data.type === 'power_use' && data.powerId === 'coinrob') {
      if (!sender || room.status !== 'playing' || !room.gameStarted) {
        rejectUse(ws, null, 'inactive_game');
        return true;
      }
      if (!room.coinRobUses) room.coinRobUses = new Set();
      if (room.coinRobUses.has(sender.idx)) {
        rejectUse(ws, null, 'already_used');
        return true;
      }

      const players = loadPlayers();
      const attacker = findPlayerByName(players, sender.name);
      if (!attacker) {
        rejectUse(ws, null, 'missing_account');
        return true;
      }
      const before = { ...attacker, inventory: { ...(attacker.inventory || {}) } };
      const consumed = consumePlayerInventoryItem(attacker, 'coinrob');
      if (!consumed.ok) {
        rejectUse(ws, consumed.inventory);
        return true;
      }
      try {
        savePlayers(players);
      } catch (error) {
        Object.keys(attacker).forEach(key => delete attacker[key]);
        Object.assign(attacker, before);
        L.err(`No se pudo guardar el uso de Robo de Monedas: ${error.message}`);
        rejectUse(ws, attacker.inventory, 'save_failed');
        return true;
      }

      room.coinRobUses.add(sender.idx);
      room.coinRobSettled ||= new Set();
      const outgoing = { type: 'power_use', powerId: 'coinrob', player: sender.idx };
      room.players.filter(player => player.ws !== ws).forEach(player => sendGame(player.ws, outgoing));
      L.game(`Robo de Monedas usado por ${sender.name} en sala [${ws.roomId}]`);
      return true;
    }

    if (data.type !== 'coinrob_result') return false;
    if (!sender || room.status !== 'playing' || !room.gameStarted || !room.coinRobUses) return true;
    const attackerIdx = Number(data.toPlayer);
    const attackerSlot = room.players.find(player => player.idx === attackerIdx && player.ws !== ws);
    if (!attackerSlot || !room.coinRobUses.has(attackerSlot.idx)) return true;
    room.coinRobSettled ||= new Set();
    const resultKey = `${room.gameId || '?'}:${attackerSlot.idx}:${sender.idx}`;
    if (room.coinRobSettled.has(resultKey)) return true;

    const players = loadPlayers();
    const attacker = findPlayerByName(players, attackerSlot.name);
    const victim = findPlayerByName(players, sender.name);
    if (!attacker || !victim || attacker === victim) return true;
    const amount = Math.min(60, Math.max(0, Math.floor(Number(victim.aureos) || 0)));
    const beforeAttacker = { ...attacker };
    const beforeVictim = { ...victim };
    if (amount > 0) {
      attacker.aureos = (Number(attacker.aureos) || 0) + amount;
      victim.aureos = Math.max(0, (Number(victim.aureos) || 0) - amount);
    }
    try {
      savePlayers(players);
    } catch (error) {
      Object.keys(attacker).forEach(key => delete attacker[key]);
      Object.assign(attacker, beforeAttacker);
      Object.keys(victim).forEach(key => delete victim[key]);
      Object.assign(victim, beforeVictim);
      L.err(`No se pudo guardar el robo de Áureos: ${error.message}`);
      sendGame(attackerSlot.ws, {
        type: 'coinrob_result', toPlayer: attackerSlot.idx, fromPlayer: sender.idx,
        stolen: 0, total: attacker.aureos || 0,
      });
      return true;
    }

    room.coinRobSettled.add(resultKey);
    if (amount > 0) {
      logAureosTx(attacker, amount, 'robo_realizado');
      logAureosTx(victim, -amount, 'robo_recibido');
    }
    sendGame(attackerSlot.ws, {
      type: 'coinrob_result', toPlayer: attackerSlot.idx, fromPlayer: sender.idx,
      stolen: amount, total: attacker.aureos || 0,
    });
    sendGame(ws, {
      type: 'coinrob_balance_update', toPlayer: sender.idx, fromPlayer: attackerSlot.idx,
      stolen: amount, balance: victim.aureos || 0,
    });
    L.game(`Robo de Monedas: ${attacker.name} obtuvo ${amount} de ${victim.name}`);
    return true;
  }

  return Object.freeze({ handle });
}

module.exports = { createCoinRobMessages };
