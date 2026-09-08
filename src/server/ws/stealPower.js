'use strict';

function createStealPower({ send, L }) {
  function handleStealPower(ws, room, message) {
    const data = message.data || {};
    if (data.type !== 'power_use' || data.powerId !== 'steal') return false;
    if (data.targetIdx == null && !data.area) {
      L.game(`⚠️ Poder "${data.powerId}" sin targetIdx en sala [${ws.roomId}] — descartado`);
      return true;
    }
    if (data.targetIdx != null) {
      const target = room.players.find(player => player.idx === data.targetIdx && player.ws !== ws);
      if (target) send(target.ws, { type: 'game_msg', data: message.data });
    } else {
      room.players.filter(player => player.ws !== ws).forEach(player => send(player.ws, { type: 'game_msg', data: message.data }));
    }
    return true;
  }

  return Object.freeze({ handleStealPower });
}

module.exports = { createStealPower };
